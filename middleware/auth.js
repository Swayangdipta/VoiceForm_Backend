const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    console.warn("auth error: missing token", {
      method: req.method,
      url: req.originalUrl,
    });
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.warn("auth error: invalid token", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });
    res.status(401).json({ message: "Invalid token" });
  }
};
