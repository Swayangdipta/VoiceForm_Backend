const pool = require("../config/db");
const usVisaController = require("./usVisaController");
const fs = require("fs");
const path = require("path");

// ─── Prefix map — matches formType keys sent from the app ─────────────────────
const PREFIX_MAP = {
  visa:        "VIS",
  passport:    "PPT",
  pcc:         "PCC",
  attestation: "ATT",
  flightHotel: "FHB",
  usVisa:       "USV",
  // legacy web keys kept for compatibility
  Visa:                    "VIS",
  Passport:                "PPT",
  PCC:                     "PCC",
  Attestation:             "ATT",
  "Flight-Hotel Booking":  "FHB",
  "Student Admission":     "STU",
  "Travel Insurance":      "INS",
};

// ─── Human-readable label stored in application_type column ──────────────────
const TYPE_LABEL = {
  visa:        "Visa",
  passport:    "Passport",
  pcc:         "PCC",
  attestation: "Attestation",
  flightHotel: "Flight-Hotel Booking",
  usVisa:       "US Visa"
};

const parseJson = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const getUploadedDocuments = (files) => {
  const documents = [];

  if (!files) {
    return documents;
  }

  Object.keys(files).forEach((field) => {
    files[field].forEach((file) => {
      documents.push({
        type: field,
        file: file.filename,
        original_name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
      });
    });
  });

  return documents;
};

const deleteUploadedFile = (filename) => {
  if (!filename) return;

  const filePath = path.join(
    path.resolve("uploads"),
    path.basename(filename)
  );

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Failed to delete uploaded file "${filename}":`, error);
  }
};

exports.createApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const body   = req.body;

    // form_type sent from app (e.g. "visa"), fallback to application_type for web
    const formKey = body.formType || body.form_type || body.application_type;
    const application_type = TYPE_LABEL[formKey] || formKey;
    const prefix           = PREFIX_MAP[formKey] || "APP";

    if (formKey === "usVisa") {
      return usVisaController.createApplication(req, res);
    }

    // ── Generate application number ─────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];

    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM application
       WHERE DATE(submission_date) = ?
       AND application_type = ?`,
      [today, application_type]
    );

    const serial        = String(countResult[0].count + 1).padStart(4, "0");
    const formattedDate = new Date()
      .toLocaleDateString("en-GB")
      .split("/")
      .join("-")
      .slice(0, 10);

    const application_no = `${prefix}/${formattedDate}/${serial}`;

    // ── Map all form fields to DB columns ───────────────────────────────────
    const {
      // Personal info
      first_name, last_name, mobile, email,
      address, city, state, pin,

      // Shared
      country,

      // Visa
      tenure_of_visa, purpose_of_visit, date_of_arrival, duration_of_stay,

      // Passport
      passport_type, reissue_reason,

      // Flight / Hotel
      date_of_departure, from_city, to_city,

      // Attestation — "purpose" maps to purpose_of_visit
      purpose,
    } = body;

    // ── Build documents array from uploaded files ───────────────────────────
    const documents = [];
    if (req.files) {
      Object.keys(req.files).forEach((field) => {
        req.files[field].forEach((file) => {
          documents.push({
            type: field,
            file: file.filename,
            original_name: file.originalname,
            mime_type: file.mimetype,
            size: file.size,
          });
        });
      });
    }

    // ── Insert ──────────────────────────────────────────────────────────────
    const [result] = await pool.query(
      `INSERT INTO application
        (applicant_id, applicant_type,
         application_type, passport_type, reissue_reason,
         first_name, last_name, mobile, email,
         address, city, state, pin,
         country,
         tenure_of_visa, purpose_of_visit, date_of_arrival, duration_of_stay,
         from_city, to_city, date_of_departure,
         travel_date,
         submission_date, status, application_no, documents)
       VALUES
        (?, 'agent',
         ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?,
         ?, ?, ?, ?,
         ?, ?, ?,
         CURDATE(),
         NOW(), '0', ?, ?)`,
      [
        userId,
        application_type,
        passport_type   || null,
        reissue_reason  || null,
        first_name      || null,
        last_name       || null,
        mobile          || null,
        email           || null,
        address         || null,
        city            || null,
        state           || null,
        pin             || null,
        country         || null,
        tenure_of_visa  || null,
        // attestation sends "purpose", visa sends "purpose_of_visit"
        purpose_of_visit || purpose || null,
        date_of_arrival  || null,
        duration_of_stay || null,
        from_city        || null,
        to_city          || null,
        date_of_departure || null,
        application_no,
        JSON.stringify(documents),
      ]
    );

    res.status(201).json({
      message:        "Application created successfully",
      application_no,
      application_id: result.insertId,
    });

  } catch (error) {
    console.error("createApplication error:", error);
    res.status(500).json({ message: "Failed to create application", error: error.message });
  }
};

// ─── Get all applications for the logged-in agent ─────────────────────────────
exports.getApplications = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT id, application_no, application_type, first_name, last_name,
              country, status, submission_date, created_at
       FROM application
       WHERE applicant_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ applications: rows });

  } catch (error) {
    console.error("getApplications error:", error);
    res.status(500).json({ message: "Failed to fetch applications", error: error.message });
  }
};

// ─── Get single application detail ───────────────────────────────────────────
exports.getApplicationById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM application WHERE id = ? AND applicant_id = ?`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Application not found" });
    }

    const app = rows[0];
    if (app.documents && typeof app.documents === "string") {
      try { app.documents = JSON.parse(app.documents); } catch (_) {}
    }

    if (app.form_data && typeof app.form_data === "string") {
        try {
            app.form_data = JSON.parse(app.form_data);
        } catch (_) {}
    }

    res.json({ application: app });

  } catch (error) {
    console.error("getApplicationById error:", error);
    res.status(500).json({ message: "Failed to fetch application", error: error.message });
  }
};

// ─── Update application ──────────────────────────────────────────────────────
exports.updateApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const body = req.body;

    // ── Get existing application + verify ownership ─────────────────────────
    const [rows] = await pool.query(
      `SELECT *
       FROM application
       WHERE id = ? AND applicant_id = ?`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    const application = rows[0];

    // ── Parse existing documents ────────────────────────────────────────────
    let oldDocuments = parseJson(application.documents, []);

    if (!Array.isArray(oldDocuments)) {
      oldDocuments = [];
    }

    // ── Parse documents frontend wants to keep ──────────────────────────────
    let existingDocuments = parseJson(
      body.existing_documents,
      []
    );

    if (!Array.isArray(existingDocuments)) {
      return res.status(400).json({
        message: "existing_documents must be a valid JSON array",
      });
    }

    // ── Keep only documents that actually belong to this application ────────
    const keptDocuments = oldDocuments.filter((oldDocument) => {
      return existingDocuments.some((requestedDocument) => {
        return (
          requestedDocument &&
          requestedDocument.file === oldDocument.file &&
          requestedDocument.type === oldDocument.type
        );
      });
    });

    // ── Delete documents removed by the user ────────────────────────────────
    for (const oldDocument of oldDocuments) {
      const isKept = keptDocuments.some(
        (keptDocument) =>
          keptDocument.file === oldDocument.file &&
          keptDocument.type === oldDocument.type
      );

      if (!isKept) {
        deleteUploadedFile(oldDocument.file);
      }
    }

    // ── Add newly uploaded documents ─────────────────────────────────────────
    const newDocuments = getUploadedDocuments(req.files);

    const documents = [
      ...keptDocuments,
      ...newDocuments,
    ];

    // ── Build complete form_data ────────────────────────────────────────────
    //
    // existing_documents is transport metadata and must not become
    // part of the actual form data.
    //
    const formData = {};

    Object.keys(body).forEach((key) => {
      if (key === "existing_documents") {
        return;
      }

      const value = body[key];

      // Restore arrays/objects which were JSON-stringified by React Native.
      if (typeof value === "string") {
        const trimmed = value.trim();

        if (
          (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
          (trimmed.startsWith("{") && trimmed.endsWith("}"))
        ) {
          try {
            formData[key] = JSON.parse(value);
            return;
          } catch (_) {
            // Keep original value.
          }
        }
      }

      formData[key] = value;
    });

    // ── Determine form type ─────────────────────────────────────────────────
    const formKey =
      body.formType ||
      body.form_type ||
      body.application_type ||
      application.application_type;

    const applicationType =
      TYPE_LABEL[formKey] ||
      application.application_type;

    // ── Map generic fields to existing application columns ──────────────────
    const first_name = body.first_name ?? null;
    const last_name = body.last_name ?? null;

    // US Visa uses primary_mobile.
    // Legacy forms use mobile.
    const mobile =
      body.primary_mobile ??
      body.mobile ??
      null;

    const email = body.email ?? null;

    const address = body.address ?? null;
    const city = body.city ?? null;
    const state = body.state ?? null;
    const pin = body.pin ?? null;
    const location = body.location ?? null;
    const country = body.country ?? null;

    const passport_type = body.passport_type ?? null;
    const reissue_reason = body.reissue_reason ?? null;

    const tenure_of_visa = body.tenure_of_visa ?? null;

    const purpose_of_visit =
      body.purpose_of_visit ??
      body.purpose ??
      null;

    const date_of_arrival = body.date_of_arrival ?? null;
    const duration_of_stay = body.duration_of_stay ?? null;

    const dob = body.dob ?? null;
    const currency = body.currency ?? null;
    const travel_date = body.travel_date ?? null;
    const amount = body.amount ?? null;

    const from_city = body.from_city ?? null;
    const to_city = body.to_city ?? null;
    const date_of_departure = body.date_of_departure ?? null;

    const level_of_study = body.level_of_study ?? null;
    const preferred_country = body.preferred_country ?? null;
    const school_university = body.school_university ?? null;
    const course_name = body.course_name ?? null;

    // ── Update ──────────────────────────────────────────────────────────────
    //
    // application_no, applicant_id, applicant_type, submission_date
    // and status are deliberately NOT changed.
    //
    await pool.query(
      `UPDATE application
       SET
         application_type = ?,
         passport_type = ?,
         reissue_reason = ?,

         first_name = ?,
         last_name = ?,
         mobile = ?,
         email = ?,

         address = ?,
         city = ?,
         state = ?,
         pin = ?,
         location = ?,
         country = ?,

         tenure_of_visa = ?,
         purpose_of_visit = ?,
         date_of_arrival = ?,
         duration_of_stay = ?,

         dob = ?,
         currency = ?,
         travel_date = ?,
         amount = ?,

         from_city = ?,
         to_city = ?,
         date_of_departure = ?,

         level_of_study = ?,
         preferred_country = ?,
         school_university = ?,
         course_name = ?,

         documents = ?,
         form_data = ?

       WHERE id = ?
         AND applicant_id = ?`,
      [
        applicationType,
        passport_type,
        reissue_reason,

        first_name,
        last_name,
        mobile,
        email,

        address,
        city,
        state,
        pin,
        location,
        country,

        tenure_of_visa,
        purpose_of_visit,
        date_of_arrival,
        duration_of_stay,

        dob,
        currency,
        travel_date,
        amount,

        from_city,
        to_city,
        date_of_departure,

        level_of_study,
        preferred_country,
        school_university,
        course_name,

        JSON.stringify(documents),
        JSON.stringify(formData),

        id,
        userId,
      ]
    );

    res.json({
      message: "Application updated successfully",
      application_no: application.application_no,
      application_id: Number(id),
    });

  } catch (error) {
    console.error("updateApplication error:", error);

    res.status(500).json({
      message: "Failed to update application",
      error: error.message,
    });
  }
};

// ─── Delete application ──────────────────────────────────────────────────────
exports.deleteApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // ── Find application and verify ownership ───────────────────────────────
    const [rows] = await pool.query(
      `SELECT id, application_no, documents
       FROM application
       WHERE id = ? AND applicant_id = ?`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    const application = rows[0];

    // ── Parse documents ────────────────────────────────────────────────────
    let documents = parseJson(application.documents, []);

    if (!Array.isArray(documents)) {
      documents = [];
    }

    // ── Delete all physical files belonging to application ─────────────────
    for (const document of documents) {
      if (document?.file) {
        deleteUploadedFile(document.file);
      }
    }

    // ── Delete database row ─────────────────────────────────────────────────
    await pool.query(
      `DELETE FROM application
       WHERE id = ? AND applicant_id = ?`,
      [id, userId]
    );

    res.json({
      message: "Application deleted successfully",
      application_id: Number(id),
      application_no: application.application_no,
    });

  } catch (error) {
    console.error("deleteApplication error:", error);

    res.status(500).json({
      message: "Failed to delete application",
      error: error.message,
    });
  }
};