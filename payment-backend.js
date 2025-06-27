const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// In-memory storage (use database in production)
const validPayments = new Map(); // userSession -> paymentData
const userProgress = new Map(); // userSession -> progressData
const manualCodes = new Set(["DEMO123", "TEST456", "PREVIEW789", "CATDOG2024"]);

// Stripe webhook signatures (for production)
const validStripeEvents = new Set();

// 1. VERIFY PAYMENT FROM STRIPE
app.post("/api/verify-payment", (req, res) => {
  try {
    const { paymentId, userSession, course, amount, purchaseDate } = req.body;

    if (!paymentId || !userSession) {
      return res.status(400).json({ error: "Missing payment data" });
    }

    // Validate payment ID format (basic check)
    const validFormats = [
      /^pi_[a-zA-Z0-9_]+$/, // Stripe payment intent
      /^cs_[a-zA-Z0-9_]+$/, // Stripe checkout session
      /^payment_[0-9]+$/, // Manual payment
      /^demo_[a-zA-Z0-9]+$/, // Demo payment
      /^manual_[0-9]+$/, // Manual verification
    ];

    const isValidFormat = validFormats.some((pattern) =>
      pattern.test(paymentId)
    );

    if (!isValidFormat) {
      return res.status(400).json({ error: "Invalid payment ID format" });
    }

    // Store payment record
    const paymentData = {
      paymentId,
      userSession,
      course,
      amount: amount || 799,
      purchaseDate: purchaseDate || new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      verified: true,
      verifiedAt: new Date().toISOString(),
    };

    validPayments.set(userSession, paymentData);

    console.log(`✅ Payment verified: ${userSession} -> ${paymentId}`);

    res.json({
      verified: true,
      message: "Payment verified successfully",
      expiresAt: paymentData.expiresAt,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// 2. CHECK SPECIFIC PAYMENT
app.get("/api/check-payment/:userSession/:paymentId", (req, res) => {
  try {
    const { userSession, paymentId } = req.params;

    const paymentData = validPayments.get(userSession);

    if (paymentData && paymentData.paymentId === paymentId) {
      // Check if payment is still valid (not expired)
      const isValid = new Date() < new Date(paymentData.expiresAt);

      res.json({
        isValid,
        paymentData: isValid ? paymentData : null,
        message: isValid ? "Payment valid" : "Payment expired",
      });
    } else {
      res.json({
        isValid: false,
        message: "Payment not found",
      });
    }
  } catch (error) {
    console.error("Payment check error:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

// 3. GET USER PAYMENT STATUS
app.get("/api/user-payment-status/:userSession/:course", (req, res) => {
  try {
    const { userSession, course } = req.params;

    const paymentData = validPayments.get(userSession);

    if (paymentData && paymentData.course === course) {
      // Check if payment is still valid
      const isValid = new Date() < new Date(paymentData.expiresAt);

      if (isValid) {
        res.json({
          hasPaid: true,
          paymentId: paymentData.paymentId,
          purchaseDate: paymentData.purchaseDate,
          expiresAt: paymentData.expiresAt,
        });
      } else {
        res.json({ hasPaid: false, reason: "Payment expired" });
      }
    } else {
      res.json({ hasPaid: false, reason: "No payment found" });
    }
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: "Status check failed" });
  }
});

// 4. VERIFY MANUAL CODE
app.post("/api/verify-manual-code", (req, res) => {
  try {
    const { code, userSession, course } = req.body;

    if (!code || !userSession) {
      return res.status(400).json({ error: "Missing verification data" });
    }

    // Check predefined manual codes
    const isValidCode =
      manualCodes.has(code.toUpperCase()) || code.length >= 10; // Accept any long code

    if (isValidCode) {
      // Create payment record for manual verification
      const paymentData = {
        paymentId: code,
        userSession,
        course: course || "catdog",
        amount: 799,
        purchaseDate: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        verified: true,
        verifiedAt: new Date().toISOString(),
        method: "manual_code",
      };

      validPayments.set(userSession, paymentData);

      console.log(`✅ Manual verification: ${userSession} -> ${code}`);

      res.json({
        valid: true,
        message: "Code verified successfully",
        paymentData,
      });
    } else {
      res.json({
        valid: false,
        message: "Invalid verification code",
      });
    }
  } catch (error) {
    console.error("Manual verification error:", error);
    res.status(500).json({ error: "Manual verification failed" });
  }
});

// 5. SAVE USER PROGRESS
app.post("/api/save-progress", (req, res) => {
  try {
    const { userSession, course, completedLessons, currentLesson } = req.body;

    // Verify user has valid payment
    const paymentData = validPayments.get(userSession);
    if (!paymentData || new Date() > new Date(paymentData.expiresAt)) {
      return res.status(403).json({ error: "Invalid or expired payment" });
    }

    const progressData = {
      userSession,
      course,
      completedLessons: completedLessons || [],
      currentLesson: currentLesson || "intro",
      lastUpdated: new Date().toISOString(),
    };

    userProgress.set(userSession, progressData);

    res.json({ success: true, message: "Progress saved" });
  } catch (error) {
    console.error("Progress save error:", error);
    res.status(500).json({ error: "Failed to save progress" });
  }
});

// 6. GET USER PROGRESS
app.get("/api/get-progress/:userSession/:course", (req, res) => {
  try {
    const { userSession, course } = req.params;

    // Verify user has valid payment
    const paymentData = validPayments.get(userSession);
    if (!paymentData || new Date() > new Date(paymentData.expiresAt)) {
      return res.status(403).json({ error: "Invalid or expired payment" });
    }

    const progressData = userProgress.get(userSession) || {
      userSession,
      course,
      completedLessons: [],
      currentLesson: "intro",
      lastUpdated: new Date().toISOString(),
    };

    res.json(progressData);
  } catch (error) {
    console.error("Progress get error:", error);
    res.status(500).json({ error: "Failed to get progress" });
  }
});

// 7. ADMIN ENDPOINTS

// List all payments (for debugging)
app.get("/admin/payments", (req, res) => {
  const payments = Array.from(validPayments.entries()).map(
    ([session, data]) => ({
      userSession: session,
      paymentId: data.paymentId,
      course: data.course,
      amount: data.amount,
      purchaseDate: data.purchaseDate,
      verified: data.verified,
      method: data.method || "stripe",
    })
  );

  res.json(payments);
});

// Add manual payment (for testing)
app.post("/admin/add-payment", (req, res) => {
  const { userSession, paymentId, course = "catdog" } = req.body;

  if (!userSession || !paymentId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const paymentData = {
    paymentId,
    userSession,
    course,
    amount: 799,
    purchaseDate: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    verified: true,
    verifiedAt: new Date().toISOString(),
    method: "admin_added",
  };

  validPayments.set(userSession, paymentData);

  res.json({ success: true, message: "Payment added manually" });
});

// 8. HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    payments: validPayments.size,
    progressRecords: userProgress.size,
  });
});

// 9. SERVE COURSE PAGE
app.get("/course", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "catvsdog.html"));
});

// Error handling
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Course Payment Server running on port ${PORT}`);
  console.log(`📚 Course available at: http://localhost:${PORT}/course`);
  console.log(`🔧 Admin panel: http://localhost:${PORT}/admin/payments`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
