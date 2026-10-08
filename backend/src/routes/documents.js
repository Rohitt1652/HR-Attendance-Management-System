const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/documentController');
const fs = require('fs');

// Ensure upload directory exists
if (!fs.existsSync('uploads/documents')) {
  fs.mkdirSync('uploads/documents', { recursive: true });
}

router.use(authenticate);

// Admin: view all documents
router.get('/all', authorize('documents:manage', 'employees:view'), ctrl.getAllDocuments);

// Employee: own documents
router.get('/my', authorize('documents:view'), ctrl.getDocuments);

// Admin: documents for a specific employee
router.get('/employee/:employeeId', authorize('employees:view', 'documents:manage'), ctrl.getDocuments);

// Upload for self
router.post('/my', authorize('documents:upload'), ctrl.upload.single('file'), ctrl.uploadDocument);

// Upload multiple for self
router.post('/my/multiple', authorize('documents:upload'), ctrl.upload.array('files', 10), ctrl.uploadMultipleDocuments);

// Admin: upload for specific employee
router.post('/employee/:employeeId', authorize('employees:edit', 'documents:manage'), ctrl.upload.single('file'), ctrl.uploadDocument);

// Admin: upload multiple for specific employee
router.post('/employee/:employeeId/multiple', authorize('employees:edit', 'documents:manage'), ctrl.upload.array('files', 10), ctrl.uploadMultipleDocuments);

// Verify / Reject (admin)
router.put('/:id/verify', authorize('documents:manage'), ctrl.verifyDocument);
router.put('/:id/reject', authorize('documents:manage'), ctrl.rejectDocument);

// Delete
router.delete('/:id', authorize('documents:upload', 'documents:manage'), ctrl.deleteDocument);

module.exports = router;
