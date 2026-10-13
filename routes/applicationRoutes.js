const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const controller = require("../controllers/appilicationController");

const applicationUpload = (req, res, next) => {
  upload.any()(req, res, (error) => {
    if (error) {
      console.error("application upload error:", {
        message: error.message,
        code: error.code,
        field: error.field,
      });

      return res.status(400).json({
        message: error.message || "Failed to upload files",
      });
    }

    if (Array.isArray(req.files)) {
      req.files = req.files.reduce((files, file) => {
        if (!files[file.fieldname]) {
          files[file.fieldname] = [];
        }

        files[file.fieldname].push(file);
        return files;
      }, {});
    }

    next();
  });
};

router.post(
  "/",
  auth,
  applicationUpload,
  controller.createApplication
);

router.get('/', auth, controller.getApplications);
router.get('/:id', auth, controller.getApplicationById);

router.put(
  "/:id",
  auth,
  applicationUpload,
  controller.updateApplication
);

router.delete(
  "/:id",
  auth,
  controller.deleteApplication
);

module.exports = router;
