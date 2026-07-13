const pool = require("../config/db");

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
  if (!value) return fallback;

  if (Array.isArray(value)) return value;

  try {
    return JSON.parse(value);
  } catch {
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

// -------------------------
// Generate Application No.
// -------------------------

const generateApplicationNumber = async () => {
  const today = new Date().toISOString().split("T")[0];

  const [countResult] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM application
     WHERE DATE(submission_date)=?
     AND application_type=?`,
    [today, APPLICATION_TYPE]
  );

  const serial = String(countResult[0].count + 1).padStart(4, "0");

  const formattedDate = new Date()
    .toLocaleDateString("en-GB")
    .split("/")
    .join("-")
    .slice(0, 10);

  return `${PREFIX}/${formattedDate}/${serial}`;
};

// -------------------------
// Controller
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
    const application_no = await generateApplicationNumber();

    // Build uploaded documents
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

    // Everything except repeaters/files remains exactly as received.
    // We'll save the complete object into form_data.
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
    console.error("US Visa createApplication error:", error);

    return res.status(500).json({
      message: "Failed to create US Visa application",
      error: error.message,
    });
  }
};