const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../services/email.service");
const verificationOtpTemplate = require("../utils/email.template");

const generateOtp = async () => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  return { otp, hashedOtp, expiry };
};

const getErrorMessage = (error) => {
  return error && error.message ? error.message : "Something went wrong";
};

const getDuplicateMessage = (error) => {
  if (!error || error.code !== "ER_DUP_ENTRY") return null;

  const message = (error.sqlMessage || error.message || "").toLowerCase();

  if (message.includes("phone")) {
    return "Phone number already registered";
  }

  if (message.includes("email")) {
    return "Email already registered";
  }

  return "User already registered";
};

exports.register = async (req, res) => {
  try {
    const { first_name, last_name, phone, email, password, location } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const { otp, hashedOtp, expiry } = await generateOtp();

    console.log("Registering user:", { first_name, last_name, phone, email, location });

    await pool.query(
      `INSERT INTO users
      (first_name,last_name,phone,email,location,password,email_otp,otp_expiry,email_verified,status)
      VALUES (?,?,?,?,?,?,?,?,0,1)`,[first_name,last_name,phone,email,location,hashedPassword,hashedOtp,expiry]
    );

    await sendEmail({
      to: email,
      subject: "Verify your Email",
      html: verificationOtpTemplate({
          name: first_name,
          otp,
          expiry: 10
      })
    });


    return res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email."
    });
  } catch (error) {
    const duplicateMessage = getDuplicateMessage(error);

    if (duplicateMessage) {
      return res.status(400).json({
        message: duplicateMessage,
      });
    }

    console.error("register error:", error);
    return res.status(500).json({
      message: "Failed to register user",
      error: getErrorMessage(error),
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email=?",
      [email]
    );

    console.log("Login")

    if (!rows.length)
      return res.status(400).json({ message: "No User Found" });

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    if (!user.status) {
      return res.status(401).json({
          message: "Account disabled."
      });
    }

    if (!user.email_verified) {

      const { otp, hashedOtp, expiry } = await generateOtp();

      await pool.query(
        `UPDATE users
         SET email_otp=?,
             otp_expiry=?
         WHERE id=?`,
        [
            hashedOtp,
            expiry,
            user.id
        ]
      );

      await sendEmail({
        to:user.email,
        subject:"Verify your Email",
        html:verificationOtpTemplate({
            name:user.first_name,
            otp,
            expiry:10
        })
      });

      return res.status(403).json({
        verified:false,
        message:"Email not verified. A new OTP has been sent."
      });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ token, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email } });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({
      message: "Failed to login",
      error: getErrorMessage(error),
    });
  }
};

exports.verifyEmail = async (req,res)=>{
  try {

    const {email,otp}=req.body;

    const [rows]=await pool.query(
        "SELECT * FROM users WHERE email=?",
        [email]
    );

    if(!rows.length)
        return res.status(404).json({
            message:"No User Found"
        });

    const user=rows[0];

    if(user.email_verified){
        return res.json({
            message:"Email already verified."
        });
    }

    if(new Date(user.otp_expiry)<new Date()){
        return res.status(400).json({
            message:"OTP expired."
        });
    }

    const valid=await bcrypt.compare(
        otp,
        user.email_otp
    );

    if(!valid){
        return res.status(400).json({
            message:"Invalid OTP."
        });
    }

    await pool.query(
        `UPDATE users
         SET
            email_verified=1,
            email_otp=NULL,
            otp_expiry=NULL
         WHERE id=?`,
         [user.id]
    );

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return res.json({ token, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email } });
  } catch (error) {
    console.error("verifyEmail error:", error);
    return res.status(500).json({
      message: "Failed to verify email",
      error: getErrorMessage(error),
    });
  }
};

exports.resendOtp = async (req,res)=>{
  try {

    const {email}=req.body;

    const [rows]=await pool.query(
        "SELECT * FROM users WHERE email=?",
        [email]
    );

    if(!rows.length)
        return res.status(404).json({
            message:"No User Found"
        });

    const user=rows[0];

    if(user.email_verified){
        return res.json({
            message:"Email already verified."
        });
    }

    const otp=crypto.randomInt(100000,999999).toString();

    const hashedOtp=await bcrypt.hash(otp,10);

    const expiry=new Date(Date.now()+10*60*1000);

    await pool.query(
        `UPDATE users
         SET email_otp=?,
             otp_expiry=?
         WHERE id=?`,
        [
            hashedOtp,
            expiry,
            user.id
        ]
    );

    await sendEmail({
        to:user.email,
        subject:"Verify your Email",
        html:verificationOtpTemplate({
            name:user.first_name,
            otp,
            expiry:10
        })
    });

    res.json({
        success:true,
        message:"OTP sent successfully."
    });
  } catch (error) {
    console.error("resendOtp error:", error);
    return res.status(500).json({
      message: "Failed to resend OTP",
      error: getErrorMessage(error),
    });
  }
};
