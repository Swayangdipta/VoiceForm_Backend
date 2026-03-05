const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  const { first_name, last_name, phone, email, password, location } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);
  console.log("Hitting registration");

  await pool.query(
    `INSERT INTO users 
     (first_name, last_name, phone, email, location, password, status)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [first_name, last_name, phone, email, location, hashedPassword]
  );

  console.log("Success registration");
  

  res.json({ message: "User registered successfully" });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.query(
    "SELECT * FROM users WHERE email=? AND status=1",
    [email]
  );

  if (!rows.length)
    return res.status(400).json({ message: "Invalid credentials" });

  const user = rows[0];

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch)
    return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email } });
};