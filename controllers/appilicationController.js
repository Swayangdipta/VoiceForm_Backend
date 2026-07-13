const pool = require("../config/db");
const usVisaController = require("./usVisaController");

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