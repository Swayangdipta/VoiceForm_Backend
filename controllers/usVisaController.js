const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// Prefix & Label
const PREFIX = "USV";
const APPLICATION_TYPE = "US Visa";

// Fields that arrive JSON.stringified from the app
const JSON_FIELDS = [
  "previous_visits",
  "previous_employments",
  "education_history",
  "languages",
  "visited_countries_last_5_years",
];

// -------------------------
// Helpers
// -------------------------

const parseJsonField = (value, fallback = []) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value;
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

const requiredFields = [
  "first_name",
  "last_name",
  "primary_mobile",
  "email",
];

const validate = (body) => {
  for (const field of requiredFields) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ""
    ) {
      return `Missing required field: ${field}`;
    }
  }

  return null;
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
  if (!filename) {
    return;
  }

  // basename prevents paths such as ../../something
  const safeFilename = path.basename(filename);

  const filePath = path.join(
    path.resolve("uploads"),
    safeFilename
  );

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(
      `Failed to delete uploaded file "${filename}":`,
      error
    );
  }
};

const parseDocuments = (documents) => {
  if (!documents) {
    return [];
  }

  if (Array.isArray(documents)) {
    return documents;
  }

  try {
    const parsed = JSON.parse(documents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

// -------------------------
// Generate Application No.
// -------------------------

const generateApplicationNumber = async () => {
  const today = new Date().toISOString().split("T")[0];

  const [countResult] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM application
     WHERE DATE(submission_date) = ?
     AND application_type = ?`,
    [today, APPLICATION_TYPE]
  );

  const serial = String(
    countResult[0].count + 1
  ).padStart(4, "0");

  const formattedDate = new Date()
    .toLocaleDateString("en-GB")
    .split("/")
    .join("-")
    .slice(0, 10);

  return `${PREFIX}/${formattedDate}/${serial}`;
};

// -------------------------
// CREATE
// -------------------------

exports.createApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = { ...req.body };

    // Convert repeater JSON strings back into arrays
    JSON_FIELDS.forEach((field) => {
      body[field] = parseJsonField(body[field], []);
    });

    // Validation
    const validationError = validate(body);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    // Application Number
    const application_no =
      await generateApplicationNumber();

    // Build uploaded documents
    const documents = getUploadedDocuments(req.files);

    // Complete form data
    const formData = {
      ...body,
      previous_visits: body.previous_visits,
      previous_employments: body.previous_employments,
      education_history: body.education_history,
      languages: body.languages,
      visited_countries_last_5_years:
        body.visited_countries_last_5_years,
    };

    // Insert into database
    const [result] = await pool.query(
      `INSERT INTO application
      (
        applicant_id,
        applicant_type,
        application_type,
        first_name,
        last_name,
        mobile,
        email,
        submission_date,
        status,
        application_no,
        documents,
        form_data
      )
      VALUES
      (
        ?,
        'agent',
        ?,
        ?,
        ?,
        ?,
        ?,
        NOW(),
        '0',
        ?,
        ?,
        ?
      )`,
      [
        userId,
        APPLICATION_TYPE,
        body.first_name,
        body.last_name,
        body.primary_mobile,
        body.email,
        application_no,
        JSON.stringify(documents),
        JSON.stringify(formData),
      ]
    );

    return res.status(201).json({
      message: "Application created successfully",
      application_no,
      application_id: result.insertId,
    });

  } catch (error) {
    console.error(
      "US Visa createApplication error:",
      error
    );

    return res.status(500).json({
      message: "Failed to create US Visa application",
      error: error.message,
    });
  }
};

// -------------------------
// UPDATE
// -------------------------

exports.updateApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const body = { ...req.body };

    // -------------------------------------------------
    // Find application + verify ownership
    // -------------------------------------------------

    const [rows] = await pool.query(
      `SELECT *
       FROM application
       WHERE id = ?
       AND applicant_id = ?
       AND application_type = ?`,
      [
        id,
        userId,
        APPLICATION_TYPE,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "US Visa application not found",
      });
    }

    const application = rows[0];

    // -------------------------------------------------
    // Parse repeater fields
    // -------------------------------------------------

    JSON_FIELDS.forEach((field) => {
      body[field] = parseJsonField(
        body[field],
        []
      );
    });

    // -------------------------------------------------
    // Validate updated form
    // -------------------------------------------------

    const validationError = validate(body);

    if (validationError) {
      // Multer may already have saved newly uploaded
      // files. Remove them because the update is rejected.
      const newDocuments = getUploadedDocuments(
        req.files
      );

      newDocuments.forEach((document) => {
        deleteUploadedFile(document.file);
      });

      return res.status(400).json({
        message: validationError,
      });
    }

    // -------------------------------------------------
    // Existing documents
    // -------------------------------------------------

    const oldDocuments = parseDocuments(
      application.documents
    );

    const existingDocuments = parseJsonField(
      body.existing_documents,
      []
    );

    if (!Array.isArray(existingDocuments)) {
      return res.status(400).json({
        message:
          "existing_documents must be a valid JSON array",
      });
    }

    // -------------------------------------------------
    // Only allow keeping documents that actually
    // belong to this application.
    // -------------------------------------------------

    const keptDocuments = oldDocuments.filter(
      (oldDocument) => {
        return existingDocuments.some(
          (requestedDocument) => {
            return (
              requestedDocument &&
              requestedDocument.file ===
                oldDocument.file &&
              requestedDocument.type ===
                oldDocument.type
            );
          }
        );
      }
    );

    // -------------------------------------------------
    // Delete old documents removed by the user
    // -------------------------------------------------

    for (const oldDocument of oldDocuments) {
      const shouldKeep = keptDocuments.some(
        (keptDocument) => {
          return (
            keptDocument.file === oldDocument.file &&
            keptDocument.type === oldDocument.type
          );
        }
      );

      if (!shouldKeep) {
        deleteUploadedFile(oldDocument.file);
      }
    }

    // -------------------------------------------------
    // Add newly uploaded documents
    // -------------------------------------------------

    const newDocuments =
      getUploadedDocuments(req.files);

    const documents = [
      ...keptDocuments,
      ...newDocuments,
    ];

    // -------------------------------------------------
    // Build COMPLETE form_data
    //
    // existing_documents is transport metadata and
    // should NOT become part of the form.
    // -------------------------------------------------

    delete body.existing_documents;

    const formData = {
      ...body,

      previous_visits: body.previous_visits,
      previous_employments:
        body.previous_employments,
      education_history:
        body.education_history,
      languages: body.languages,
      visited_countries_last_5_years:
        body.visited_countries_last_5_years,
    };

    // -------------------------------------------------
    // Update database
    //
    // application_no stays unchanged.
    // status stays unchanged.
    // applicant_id stays unchanged.
    // submission_date stays unchanged.
    // created_at stays unchanged.
    //
    // updated_at is automatically updated by MySQL.
    // -------------------------------------------------

    await pool.query(
      `UPDATE application
       SET
         first_name = ?,
         last_name = ?,
         mobile = ?,
         email = ?,
         documents = ?,
         form_data = ?
       WHERE id = ?
       AND applicant_id = ?
       AND application_type = ?`,
      [
        body.first_name,
        body.last_name,
        body.primary_mobile,
        body.email,

        JSON.stringify(documents),
        JSON.stringify(formData),

        id,
        userId,
        APPLICATION_TYPE,
      ]
    );

    return res.json({
      message: "US Visa application updated successfully",
      application_no:
        application.application_no,
      application_id: Number(id),
    });

  } catch (error) {
    console.error(
      "US Visa updateApplication error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to update US Visa application",
      error: error.message,
    });
  }
};