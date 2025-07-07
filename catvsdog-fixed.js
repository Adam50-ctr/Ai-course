// TELJES CAT VS DOG AI COURSE MANAGEMENT SYSTEM
// Teljes fizetési rendszer, felhasználókezelés, progress tracking

class CatDogCourseManager {
  constructor() {
    this.isPaid = false;
    this.currentUser = null;
    this.currentLesson = "payment";
    this.sessionChecked = false;
    this.courseProgress = {};
    this.paymentProvider = null;
    this.analytics = new CourseAnalytics();

    // Fizetési konfiguráció
    this.config = {
      coursePrice: 7.99,
      currency: "USD",
      stripePubKey: "pk_test_51234567890abcdef...",
      sessionTimeout: 2 * 60 * 60 * 1000, // 2 óra
      trialPeriod: 24 * 60 * 60 * 1000, // 24 óra trial
    };

    // Course struktura
    this.courseStructure = {
      free: ["payment", "basics"],
      premium: [
        "intro",
        "setup",
        "data",
        "model",
        "training",
        "prediction",
        "app",
        "extras",
      ],
      all: [
        "payment",
        "basics",
        "intro",
        "setup",
        "data",
        "model",
        "training",
        "prediction",
        "app",
        "extras",
      ],
    };

    console.log("🚀 Cat vs Dog Course Manager initializing...");
    this.init();
  }

  async init() {
    try {
      // 1. Session és localStorage ellenőrzés
      await this.checkExistingSession();

      // 2. URL paraméterek feldolgozása (Stripe redirect, promo kódok)
      this.handleURLParameters();

      // 3. Firebase inicializálás
      await this.initFirebase();

      // 4. Fizetési szolgáltatók inicializálása
      await this.initPaymentProviders();

      // 5. Analytics inicializálás
      this.analytics.init();

      // 6. UI frissítése
      this.updateUI();
      this.setupEventListeners();

      // 7. Auto-save beállítása
      this.setupAutoSave();

      console.log("✅ Course Manager ready:", {
        paid: this.isPaid,
        session: this.sessionChecked,
        user: this.currentUser?.email || "Guest",
        progress: Object.keys(this.courseProgress).length,
      });
    } catch (error) {
      console.error("❌ Initialization error:", error);
      this.handleInitError(error);
    }
  }

  // ==================== SESSION MANAGEMENT ====================

  async checkExistingSession() {
    console.log("🔍 Checking existing session...");

    // SessionStorage ellenőrzés
    const sessionPaid = sessionStorage.getItem("catdog_session_paid");
    const sessionTime = sessionStorage.getItem("catdog_session_time");
    const sessionUser = sessionStorage.getItem("catdog_session_user");

    if (sessionPaid === "true" && sessionTime) {
      const sessionAge = Date.now() - parseInt(sessionTime);

      if (sessionAge < this.config.sessionTimeout) {
        this.isPaid = true;
        this.sessionChecked = true;
        if (sessionUser) {
          this.currentUser = JSON.parse(sessionUser);
        }
        console.log("✅ Valid session found");
        return;
      } else {
        this.clearSession();
      }
    }

    // LocalStorage ellenőrzés
    const localPaid = localStorage.getItem("catdog_paid");
    const paymentData = localStorage.getItem("catdog_payment");
    const progressData = localStorage.getItem("catdog_progress");

    if (localPaid === "true" && paymentData) {
      try {
        const payment = JSON.parse(paymentData);
        const now = new Date();
        const expiresAt = new Date(payment.expiresAt);

        if (payment.verified && now < expiresAt) {
          this.isPaid = true;
          this.setSession(payment);
          console.log("💾 Valid payment data found");
        }
      } catch (e) {
        console.warn("Invalid payment data:", e);
        this.clearPaymentData();
      }
    }

    // Progress betöltése
    if (progressData) {
      try {
        this.courseProgress = JSON.parse(progressData);
      } catch (e) {
        console.warn("Invalid progress data:", e);
      }
    }
  }

  setSession(paymentData = null) {
    const sessionData = {
      paid: true,
      timestamp: Date.now(),
      user: this.currentUser,
      payment: paymentData,
    };

    sessionStorage.setItem("catdog_session_paid", "true");
    sessionStorage.setItem("catdog_session_time", Date.now().toString());
    if (this.currentUser) {
      sessionStorage.setItem(
        "catdog_session_user",
        JSON.stringify(this.currentUser)
      );
    }

    this.sessionChecked = true;
    this.isPaid = true;

    // Analytics esemény
    this.analytics.track("session_created", sessionData);

    console.log("✅ Session set successfully");
  }

  clearSession() {
    sessionStorage.removeItem("catdog_session_paid");
    sessionStorage.removeItem("catdog_session_time");
    sessionStorage.removeItem("catdog_session_user");
    this.sessionChecked = false;
    this.isPaid = false;
    console.log("🗑️ Session cleared");
  }

  clearPaymentData() {
    localStorage.removeItem("catdog_paid");
    localStorage.removeItem("catdog_payment");
    this.clearSession();
  }

  // ==================== PAYMENT SYSTEM ====================

  async initPaymentProviders() {
    console.log("💳 Initializing payment providers...");

    try {
      // Stripe inicializálás
      if (window.Stripe && this.config.stripePubKey) {
        this.stripe = Stripe(this.config.stripePubKey);
        console.log("✅ Stripe initialized");
      }

      // PayPal inicializálás (ha szükséges)
      if (window.paypal) {
        this.initPayPal();
      }
    } catch (error) {
      console.warn("Payment provider initialization failed:", error);
    }
  }

  async handleURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);

    // Stripe sikeres fizetés
    if (
      urlParams.get("success") === "true" ||
      urlParams.get("payment_status") === "paid"
    ) {
      console.log("💳 Stripe payment success detected");
      await this.handleSuccessfulPayment(urlParams);
      return;
    }

    // Stripe sikertelen fizetés
    if (urlParams.get("canceled") === "true") {
      this.handleCanceledPayment();
      return;
    }

    // Promó kód
    const promoCode = urlParams.get("promo") || urlParams.get("code");
    if (promoCode) {
      await this.handlePromoCode(promoCode);
    }

    // Affiliate tracking
    const affiliate = urlParams.get("ref") || urlParams.get("affiliate");
    if (affiliate) {
      this.trackAffiliate(affiliate);
    }

    // Direct lesson access
    const lesson = urlParams.get("lesson");
    if (lesson && this.hasAccess(lesson)) {
      this.currentLesson = lesson;
    }
  }

  async handleSuccessfulPayment(urlParams) {
    const sessionId =
      urlParams.get("session_id") ||
      urlParams.get("payment_intent") ||
      "stripe_" + Date.now();

    const paymentData = {
      verified: true,
      paymentId: sessionId,
      purchaseDate: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 év
      method: "stripe",
      amount: this.config.coursePrice,
      currency: this.config.currency,
      course: "catdog",
      version: "1.0",
    };

    // Adatok mentése
    localStorage.setItem("catdog_payment", JSON.stringify(paymentData));
    localStorage.setItem("catdog_paid", "true");

    this.setSession(paymentData);
    this.unlockAllContent();
    this.showSuccessMessage("Payment successful! Welcome to the course!");

    // Analytics esemény
    this.analytics.track("purchase_completed", {
      amount: this.config.coursePrice,
      method: "stripe",
      sessionId: sessionId,
    });

    // URL tisztítása
    window.history.replaceState({}, document.title, window.location.pathname);

    // Első lesson megjelenítése
    setTimeout(() => {
      this.showLesson("intro");
    }, 2000);
  }

  handleCanceledPayment() {
    this.showErrorMessage("Payment was canceled. You can try again anytime!");
    this.analytics.track("purchase_canceled");
  }

  async handlePromoCode(code) {
    console.log("🎫 Processing promo code:", code);

    const validCodes = {
      WELCOME10: { discount: 10, type: "percent" },
      STUDENT50: { discount: 50, type: "percent" },
      FREEMONTH: { discount: 100, type: "percent", duration: 30 },
      LAUNCH25: { discount: 25, type: "percent" },
      DEMO123: { discount: 100, type: "percent", duration: 7 },
      PREVIEW789: { discount: 100, type: "percent", duration: 3 },
    };

    const promoData = validCodes[code.toUpperCase()];

    if (promoData) {
      if (promoData.discount === 100) {
        // Ingyenes hozzáférés
        const freeAccessData = {
          verified: true,
          paymentId: "promo_" + code + "_" + Date.now(),
          purchaseDate: new Date().toISOString(),
          expiresAt: new Date(
            Date.now() + (promoData.duration || 365) * 24 * 60 * 60 * 1000
          ).toISOString(),
          method: "promo_code",
          promoCode: code,
          course: "catdog",
        };

        localStorage.setItem("catdog_payment", JSON.stringify(freeAccessData));
        localStorage.setItem("catdog_paid", "true");

        this.setSession(freeAccessData);
        this.unlockAllContent();
        this.showSuccessMessage(
          `Promo code activated! You have ${
            promoData.duration || "unlimited"
          } days of access.`
        );

        this.analytics.track("promo_code_used", {
          code,
          discount: promoData.discount,
        });

        setTimeout(() => {
          this.showLesson("intro");
        }, 2000);
      } else {
        // Kedvezmény alkalmazása
        this.applyDiscount(promoData);
      }
    } else {
      this.showErrorMessage("Invalid promo code. Please check and try again.");
    }
  }

  applyDiscount(discountData) {
    const discountedPrice =
      this.config.coursePrice * (1 - discountData.discount / 100);
    this.showSuccessMessage(
      `${
        discountData.discount
      }% discount applied! New price: ${discountedPrice.toFixed(2)}`
    );

    // Price update a payment oldalon
    const priceElement = document.querySelector(".price");
    if (priceElement) {
      priceElement.innerHTML = `
        <span style="text-decoration: line-through; opacity: 0.6;">${
          this.config.coursePrice
        }</span>
        <span style="color: #48bb78;">${discountedPrice.toFixed(2)}</span>
      `;
    }
  }

  trackAffiliate(affiliateId) {
    localStorage.setItem("catdog_affiliate", affiliateId);
    this.analytics.track("affiliate_visit", { affiliateId });
    console.log("🤝 Affiliate tracked:", affiliateId);
  }

  // ==================== FIREBASE INTEGRATION ====================

  async initFirebase() {
    try {
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
      );
      const { getAuth, onAuthStateChanged, signInAnonymously } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
      );
      const { getFirestore, doc, setDoc, getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      const firebaseConfig = {
        apiKey: "AIzaSyC-bQG1j2xsRiBxU8emivr6rxrGwV7sj6g",
        authDomain: "micro-ai-projects.firebaseapp.com",
        projectId: "micro-ai-projects",
        storageBucket: "micro-ai-projects.firebasestorage.app",
        messagingSenderId: "903965915050",
        appId: "1:903965915050:web:6f8103f88bc556c7dc1dd3",
      };

      const app = initializeApp(firebaseConfig);
      this.auth = getAuth(app);
      this.db = getFirestore(app);

      // Auth state listener
      onAuthStateChanged(this.auth, async (user) => {
        if (user) {
          this.currentUser = {
            uid: user.uid,
            email: user.email || "anonymous",
            isAnonymous: user.isAnonymous,
          };

          await this.syncUserData();
          this.showUserInfo(user);

          console.log("👤 User authenticated:", this.currentUser);
        } else {
          // Anonymous sign in
          try {
            await signInAnonymously(this.auth);
          } catch (error) {
            console.warn("Anonymous auth failed:", error);
          }
        }
      });

      console.log("🔥 Firebase initialized");
    } catch (error) {
      console.warn("Firebase initialization failed:", error);
    }
  }

  async syncUserData() {
    if (!this.currentUser || !this.db) return;

    try {
      const userDocRef = doc(this.db, "users", this.currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();

        // Szinkronizálás a cloud adatokkal
        if (userData.isPaid && !this.isPaid) {
          this.isPaid = true;
          this.setSession(userData.paymentData);
        }

        if (userData.progress) {
          this.courseProgress = {
            ...this.courseProgress,
            ...userData.progress,
          };
        }
      }

      // Current state mentése
      await setDoc(
        userDocRef,
        {
          lastActive: new Date(),
          isPaid: this.isPaid,
          progress: this.courseProgress,
          paymentData: this.isPaid
            ? JSON.parse(localStorage.getItem("catdog_payment") || "{}")
            : null,
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("User sync failed:", error);
    }
  }

  // ==================== CONTENT MANAGEMENT ====================

  updateUI() {
    if (this.isPaid) {
      this.unlockAllContent();
    } else {
      this.lockPremiumContent();
    }

    this.updateProgressIndicators();
    this.updateSidebarStatus();
  }

  unlockAllContent() {
    console.log("🔓 Unlocking all content...");

    // Minden lesson button feloldása
    const allButtons = document.querySelectorAll(".lesson-item");
    allButtons.forEach((item) => {
      item.classList.remove("locked");
      item.style.opacity = "1";
      item.style.cursor = "pointer";
      item.style.pointerEvents = "auto";
      item.removeAttribute("disabled");
    });

    // CSS override alkalmazása
    this.applyUnlockCSS();

    // Purchase button frissítése
    this.updatePurchaseButtons();

    // Success üzenet megjelenítése ha új vásárlás
    const successDiv = document.getElementById("purchaseSuccess");
    if (successDiv && !successDiv.style.display) {
      successDiv.style.display = "block";
    }

    console.log("✅ All content unlocked");
  }

  lockPremiumContent() {
    console.log("🔒 Locking premium content...");

    this.courseStructure.premium.forEach((lessonId) => {
      const buttons = document.querySelectorAll(`[onclick*="${lessonId}"]`);
      buttons.forEach((btn) => {
        btn.classList.add("locked");
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
        btn.style.pointerEvents = "none";
      });
    });
  }

  applyUnlockCSS() {
    const style = document.createElement("style");
    style.id = "unlock-override-styles";
    style.textContent = `
      .lesson-item {
        opacity: 1 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      
      .lesson-item.locked {
        opacity: 1 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      
      .lesson-item.locked::after {
        display: none !important;
      }
    `;

    const existingStyle = document.getElementById("unlock-override-styles");
    if (existingStyle) {
      existingStyle.remove();
    }

    document.head.appendChild(style);
  }

  updatePurchaseButtons() {
    const purchaseButtons = document.querySelectorAll(
      '[onclick*="payment"], .premium-purchase'
    );
    purchaseButtons.forEach((btn) => {
      if (this.isPaid) {
        btn.innerHTML = "✅ Course Purchased";
        btn.style.background = "#48bb78";
        btn.style.color = "white";
        btn.onclick = () => this.showLesson("intro");
      }
    });
  }

  // ==================== LESSON MANAGEMENT ====================

  showLesson(lessonId) {
    if (!this.hasAccess(lessonId)) {
      this.showAccessDialog(lessonId);
      return false;
    }

    console.log(`📖 Showing lesson: ${lessonId}`);

    // Hide all lessons
    const lessons = document.querySelectorAll(".lesson-content");
    lessons.forEach((lesson) => {
      lesson.style.display = "none";
      lesson.classList.remove("active");
    });

    // Remove active class from buttons
    const buttons = document.querySelectorAll(".lesson-item");
    buttons.forEach((btn) => btn.classList.remove("active"));

    // Show target lesson
    const targetLesson = document.getElementById(lessonId);
    if (targetLesson) {
      targetLesson.style.display = "block";
      targetLesson.classList.add("active");

      // Scroll to top
      const contentArea = document.querySelector(".content-area");
      if (contentArea) {
        contentArea.scrollTop = 0;
      }
    }

    // Activate button
    const targetButton = document.querySelector(`[onclick*="${lessonId}"]`);
    if (targetButton) {
      targetButton.classList.add("active");
    }

    this.currentLesson = lessonId;

    // Progress tracking
    this.markLessonAsViewed(lessonId);

    // Analytics
    this.analytics.track("lesson_viewed", {
      lessonId,
      timestamp: new Date().toISOString(),
      userType: this.isPaid ? "premium" : "free",
    });

    return true;
  }

  hasAccess(lessonId) {
    if (this.courseStructure.free.includes(lessonId)) {
      return true;
    }
    return this.isPaid;
  }

  markLessonAsViewed(lessonId) {
    if (!this.courseProgress[lessonId]) {
      this.courseProgress[lessonId] = {
        viewed: true,
        viewedAt: new Date().toISOString(),
        completed: false,
      };

      this.saveProgress();
      this.updateProgressIndicators();
    }
  }

  markLessonAsCompleted(lessonId) {
    if (!this.courseProgress[lessonId]) {
      this.courseProgress[lessonId] = {};
    }

    this.courseProgress[lessonId].completed = true;
    this.courseProgress[lessonId].completedAt = new Date().toISOString();

    this.saveProgress();
    this.updateProgressIndicators();

    // Achievement check
    this.checkAchievements();
  }

  saveProgress() {
    localStorage.setItem(
      "catdog_progress",
      JSON.stringify(this.courseProgress)
    );

    // Firebase sync
    if (this.currentUser && this.db) {
      this.syncUserData();
    }
  }

  // ==================== PROGRESS TRACKING ====================

  updateProgressIndicators() {
    const totalLessons = this.isPaid
      ? this.courseStructure.all.length
      : this.courseStructure.free.length;
    const completedLessons = Object.values(this.courseProgress).filter(
      (p) => p.completed
    ).length;
    const progressPercent = (completedLessons / totalLessons) * 100;

    // Progress bar frissítése
    const progressBars = document.querySelectorAll(".progress-fill");
    progressBars.forEach((bar) => {
      bar.style.width = `${progressPercent}%`;
    });

    // Sidebar progress indicator
    this.updateSidebarProgress();
  }

  updateSidebarProgress() {
    const sidebarTitle = document.querySelector(".course-title");
    if (sidebarTitle) {
      const totalLessons = this.isPaid
        ? this.courseStructure.all.length
        : this.courseStructure.free.length;
      const completedLessons = Object.values(this.courseProgress).filter(
        (p) => p.completed
      ).length;

      sidebarTitle.innerHTML = `
        Course Lessons
        <div style="font-size: 0.8rem; margin-top: 0.5rem; color: #667eea;">
          Progress: ${completedLessons}/${totalLessons} lessons
        </div>
      `;
    }
  }

  checkAchievements() {
    const completedCount = Object.values(this.courseProgress).filter(
      (p) => p.completed
    ).length;

    const achievements = {
      first_lesson: {
        threshold: 1,
        title: "First Step!",
        message: "You completed your first lesson!",
      },
      quarter_done: {
        threshold: Math.ceil(this.courseStructure.all.length * 0.25),
        title: "Quarter Way!",
        message: "25% of the course completed!",
      },
      half_done: {
        threshold: Math.ceil(this.courseStructure.all.length * 0.5),
        title: "Halfway There!",
        message: "50% of the course completed!",
      },
      almost_done: {
        threshold: Math.ceil(this.courseStructure.all.length * 0.75),
        title: "Almost Done!",
        message: "75% of the course completed!",
      },
      course_complete: {
        threshold: this.courseStructure.all.length,
        title: "Course Master!",
        message: "Congratulations! You completed the entire course!",
      },
    };

    Object.entries(achievements).forEach(([key, achievement]) => {
      if (
        completedCount >= achievement.threshold &&
        !this.courseProgress[`achievement_${key}`]
      ) {
        this.courseProgress[`achievement_${key}`] = {
          unlocked: true,
          unlockedAt: new Date().toISOString(),
        };

        this.showAchievementNotification(achievement);
        this.saveProgress();
      }
    });
  }

  // ==================== USER INTERFACE ====================

  showAccessDialog(lessonId) {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); display: flex; align-items: center;
      justify-content: center; z-index: 10000; font-family: Inter, sans-serif;
    `;

    const remainingLessons = this.courseStructure.premium.length;
    const completedFree = Object.keys(this.courseProgress).filter(
      (id) =>
        this.courseStructure.free.includes(id) &&
        this.courseProgress[id].completed
    ).length;

    modal.innerHTML = `
      <div style="background: white; padding: 3rem; border-radius: 20px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
        <h3 style="margin-bottom: 1rem; color: #2d3748;">Premium Content</h3>
        <p style="margin-bottom: 2rem; color: #4a5568; line-height: 1.6;">
          This lesson is part of our premium content. Get instant access to all ${remainingLessons} premium lessons!
        </p>
        
        <div style="background: #f7fafc; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem;">
          <div style="color: #667eea; font-weight: 600; margin-bottom: 1rem;">🎯 What You Get:</div>
          <div style="text-align: left; color: #4a5568;">
            ✅ Complete AI model building tutorial<br>
            ✅ Step-by-step coding guidance<br>
            ✅ Downloadable project files<br>
            ✅ Lifetime access to updates<br>
            ✅ Certificate of completion
          </div>
        </div>
        
        <div style="margin-bottom: 2rem;">
          <button onclick="courseManager.showLesson('payment'); this.closest('[style*=fixed]').remove();" 
                  style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; margin-right: 1rem; cursor: pointer; font-weight: 600; font-size: 1.1rem;">
            🚀 Get Full Access - ${this.config.coursePrice}
          </button>
        </div>
        
        <div style="margin-bottom: 1rem;">
          <button onclick="courseManager.promptVerificationCode()" 
                  style="background: #48bb78; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; margin-right: 1rem; cursor: pointer;">
            🔑 I have a promo code
          </button>
          <button onclick="this.closest('[style*=fixed]').remove()" 
                  style="background: #e53e3e; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">
            Close
          </button>
        </div>
        
        <div style="font-size: 0.9rem; color: #666; margin-top: 1rem;">
          💝 30-day money-back guarantee<br>
          🔒 Secure payment • 📧 Instant access
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Analytics
    this.analytics.track("access_dialog_shown", { lessonId, completedFree });
  }

  promptVerificationCode() {
    const code = prompt("Enter your promo code:");
    if (!code) return;

    this.handlePromoCode(code);

    // Close modal
    const modal = document.querySelector('[style*="position: fixed"]');
    if (modal) modal.remove();
  }

  showSuccessMessage(message, duration = 5000) {
    const successDiv = document.createElement("div");
    successDiv.className = "success-message";
    successDiv.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10001;
      background: linear-gradient(135deg, #48bb78, #38a169);
      color: white; padding: 1.5rem; border-radius: 12px;
      animation: slideInRight 0.5s ease-out;
      box-shadow: 0 10px 30px rgba(72, 187, 120, 0.3);
      max-width: 400px;
    `;

    successDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 1.5rem;">🎉</div>
        <div>
          <strong>Success!</strong><br>
          ${message}
        </div>
      </div>
    `;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      successDiv.remove();
    }, duration);
  }

  showErrorMessage(message, duration = 5000) {
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10001;
      background: linear-gradient(135deg, #e53e3e, #c53030);
      color: white; padding: 1.5rem; border-radius: 12px;
      animation: slideInRight 0.5s ease-out;
      box-shadow: 0 10px 30px rgba(229, 62, 62, 0.3);
      max-width: 400px;
    `;

    errorDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 1.5rem;">❌</div>
        <div>
          <strong>Error</strong><br>
          ${message}
        </div>
      </div>
    `;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, duration);
  }

  showAchievementNotification(achievement) {
    const achievementDiv = document.createElement("div");
    achievementDiv.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10002;
      background: linear-gradient(135deg, #ffd700, #ffed4e);
      color: #2d3748; padding: 2rem; border-radius: 20px;
      animation: bounceIn 0.6s ease-out;
      box-shadow: 0 20px 60px rgba(255, 215, 0, 0.4);
      text-align: center; max-width: 400px;
    `;

    achievementDiv.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 1rem;">🏆</div>
      <h3 style="margin-bottom: 0.5rem; color: #2d3748;">${achievement.title}</h3>
      <p style="margin: 0; color: #4a5568;">${achievement.message}</p>
      <button onclick="this.parentElement.remove()" 
              style="margin-top: 1rem; background: #2d3748; color: white; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;">
        Awesome!
      </button>
    `;

    document.body.appendChild(achievementDiv);

    // Auto remove after 8 seconds
    setTimeout(() => {
      if (achievementDiv.parentElement) {
        achievementDiv.remove();
      }
    }, 8000);
  }

  showUserInfo(user) {
    let userInfoDiv = document.getElementById("userInfo");

    if (!userInfoDiv) {
      const headerActions = document.querySelector(".header-actions");
      if (headerActions) {
        const userInfoHTML = `
          <div id="userInfo" style="display: flex; align-items: center; gap: 10px; background: rgba(102, 126, 234, 0.1); padding: 8px 15px; border-radius: 20px; margin-right: 15px;">
            <span style="color: #667eea; font-weight: 500; font-size: 14px;">${
              user.email || "Student"
            }</span>
            ${
              this.isPaid
                ? '<span style="background: #48bb78; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">✅ PREMIUM</span>'
                : '<span style="background: #f56500; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">FREE</span>'
            }
          </div>
        `;
        headerActions.insertAdjacentHTML("afterbegin", userInfoHTML);
      }
    }
  }

  // ==================== NAVIGATION ====================

  nextLesson() {
    const currentIndex = this.courseStructure.all.indexOf(this.currentLesson);

    if (currentIndex < this.courseStructure.all.length - 1) {
      const nextLessonId = this.courseStructure.all[currentIndex + 1];

      // Mark current lesson as completed
      this.markLessonAsCompleted(this.currentLesson);

      // Show next lesson
      this.showLesson(nextLessonId);
    } else {
      // Course completed
      this.handleCourseCompletion();
    }
  }

  handleCourseCompletion() {
    this.markLessonAsCompleted(this.currentLesson);

    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.9); display: flex; align-items: center;
      justify-content: center; z-index: 10000; font-family: Inter, sans-serif;
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 4rem; border-radius: 24px; max-width: 600px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,0.3);">
        <div style="font-size: 4rem; margin-bottom: 2rem;">🎓</div>
        <h2 style="margin-bottom: 1rem; color: #2d3748; font-size: 2.5rem;">Congratulations!</h2>
        <p style="margin-bottom: 2rem; color: #4a5568; font-size: 1.2rem; line-height: 1.6;">
          You have successfully completed the Cat vs Dog AI Course! You now have the skills to build your own AI image classifiers.
        </p>
        
        <div style="background: #f7fafc; padding: 2rem; border-radius: 16px; margin-bottom: 2rem;">
          <h3 style="color: #667eea; margin-bottom: 1rem;">🏆 What You've Accomplished:</h3>
          <div style="text-align: left; color: #4a5568;">
            ✅ Built a complete neural network from scratch<br>
            ✅ Trained an AI model with 85%+ accuracy<br>
            ✅ Created a professional web application<br>
            ✅ Learned industry-standard AI development tools<br>
            ✅ Gained hands-on machine learning experience
          </div>
        </div>
        
        <button onclick="this.closest('[style*=fixed]').remove()" 
                style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1.1rem; margin-right: 1rem;">
          🎉 Awesome!
        </button>
        
        <button onclick="window.open('https://certificates.example.com/catdog-ai', '_blank')" 
                style="background: #48bb78; color: white; border: none; padding: 1rem 2rem; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1.1rem;">
          📜 Get Certificate
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Analytics
    this.analytics.track("course_completed", {
      totalTime:
        Date.now() -
        (this.courseProgress["payment"]?.viewedAt
          ? new Date(this.courseProgress["payment"].viewedAt).getTime()
          : Date.now()),
      lessonsCompleted: Object.keys(this.courseProgress).length,
    });
  }

  // ==================== AUTO-SAVE & CLEANUP ====================

  setupAutoSave() {
    // Auto-save every 30 seconds
    setInterval(() => {
      this.saveProgress();
    }, 30000);

    // Save on page unload
    window.addEventListener("beforeunload", () => {
      this.saveProgress();
    });
  }

  setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "ArrowRight":
            e.preventDefault();
            this.nextLesson();
            break;
          case "ArrowLeft":
            e.preventDefault();
            this.previousLesson();
            break;
        }
      }
    });
  }

  previousLesson() {
    const currentIndex = this.courseStructure.all.indexOf(this.currentLesson);

    if (currentIndex > 0) {
      const prevLessonId = this.courseStructure.all[currentIndex - 1];
      this.showLesson(prevLessonId);
    }
  }

  handleInitError(error) {
    console.error("Initialization failed:", error);
    this.showErrorMessage(
      "Something went wrong. Please refresh the page and try again."
    );
  }

  // ==================== DEBUG & ADMIN ====================

  debug() {
    return {
      paid: this.isPaid,
      sessionChecked: this.sessionChecked,
      user: this.currentUser?.email || "Guest",
      progress: this.courseProgress,
      currentLesson: this.currentLesson,

      unlock: () => {
        this.isPaid = true;
        localStorage.setItem("catdog_paid", "true");
        this.setSession();
        this.unlockAllContent();
        console.log("🔓 Debug unlock activated");
      },

      reset: () => {
        this.isPaid = false;
        localStorage.removeItem("catdog_paid");
        localStorage.removeItem("catdog_payment");
        localStorage.removeItem("catdog_progress");
        this.clearSession();
        this.courseProgress = {};
        this.lockPremiumContent();
        this.showLesson("payment");
        console.log("🔄 Complete reset performed");
      },

      giveFreeTrial: (days = 7) => {
        const trialData = {
          verified: true,
          paymentId: "trial_" + Date.now(),
          purchaseDate: new Date().toISOString(),
          expiresAt: new Date(
            Date.now() + days * 24 * 60 * 60 * 1000
          ).toISOString(),
          method: "free_trial",
          course: "catdog",
        };

        localStorage.setItem("catdog_payment", JSON.stringify(trialData));
        localStorage.setItem("catdog_paid", "true");
        this.setSession(trialData);
        this.unlockAllContent();
        this.showSuccessMessage(`${days}-day free trial activated!`);
        console.log(`🎁 ${days}-day trial activated`);
      },

      showLesson: (lessonId) => {
        this.showLesson(lessonId);
        console.log(`📖 Debug: Lesson ${lessonId} shown`);
      },

      completeCurrentLesson: () => {
        this.markLessonAsCompleted(this.currentLesson);
        console.log(`✅ Lesson ${this.currentLesson} marked as completed`);
      },

      simulatePayment: () => {
        const fakeUrlParams = new URLSearchParams();
        fakeUrlParams.set("success", "true");
        fakeUrlParams.set("session_id", "cs_test_debug_" + Date.now());
        this.handleSuccessfulPayment(fakeUrlParams);
        console.log("💳 Fake payment processed");
      },

      getStats: () => {
        const totalLessons = this.courseStructure.all.length;
        const viewedLessons = Object.keys(this.courseProgress).length;
        const completedLessons = Object.values(this.courseProgress).filter(
          (p) => p.completed
        ).length;

        return {
          totalLessons,
          viewedLessons,
          completedLessons,
          progressPercent: (completedLessons / totalLessons) * 100,
          isPaid: this.isPaid,
          currentLesson: this.currentLesson,
        };
      },
    };
  }
}

// ==================== ANALYTICS CLASS ====================

class CourseAnalytics {
  constructor() {
    this.events = [];
    this.sessionStart = Date.now();
    this.userId = this.generateUserId();
  }

  init() {
    // Google Analytics 4 inicializálás (ha van)
    if (typeof gtag !== "undefined") {
      gtag("config", "GA_MEASUREMENT_ID");
    }

    // Session tracking
    this.track("session_start", {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      referrer: document.referrer,
    });

    console.log("📊 Analytics initialized");
  }

  generateUserId() {
    let userId = localStorage.getItem("catdog_user_id");
    if (!userId) {
      userId =
        "user_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
      localStorage.setItem("catdog_user_id", userId);
    }
    return userId;
  }

  track(eventName, data = {}) {
    const event = {
      event: eventName,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      sessionId: this.sessionStart,
      ...data,
    };

    this.events.push(event);

    // Local storage backup
    const savedEvents = JSON.parse(
      localStorage.getItem("catdog_analytics") || "[]"
    );
    savedEvents.push(event);
    if (savedEvents.length > 100) {
      savedEvents.splice(0, savedEvents.length - 100); // Keep last 100 events
    }
    localStorage.setItem("catdog_analytics", JSON.stringify(savedEvents));

    // Google Analytics
    if (typeof gtag !== "undefined") {
      gtag("event", eventName, {
        custom_parameter_1: JSON.stringify(data),
        user_id: this.userId,
      });
    }

    // Console log for debugging
    console.log(`📈 Analytics: ${eventName}`, data);

    // Send to server (if implemented)
    this.sendToServer(event);
  }

  async sendToServer(event) {
    try {
      // This would send to your analytics server
      // await fetch('/api/analytics', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(event)
      // });
    } catch (error) {
      console.warn("Analytics server error:", error);
    }
  }

  getSessionStats() {
    const sessionEvents = this.events.filter(
      (e) => e.sessionId === this.sessionStart
    );
    return {
      totalEvents: sessionEvents.length,
      sessionDuration: Date.now() - this.sessionStart,
      events: sessionEvents,
    };
  }
}

// ==================== GLOBAL FUNCTIONS ====================

// Global functions for HTML onclick handlers
function showLesson(lessonId) {
  if (window.courseManager) {
    window.courseManager.showLesson(lessonId);
  } else {
    console.warn("Course manager not initialized yet");
  }
}

function nextLesson() {
  if (window.courseManager) {
    window.courseManager.nextLesson();
  } else {
    console.warn("Course manager not initialized yet");
  }
}

function previousLesson() {
  if (window.courseManager) {
    window.courseManager.previousLesson();
  } else {
    console.warn("Course manager not initialized yet");
  }
}

// Stripe success handler (called from Stripe redirect)
function handleStripeSuccess(sessionId) {
  if (window.courseManager) {
    const urlParams = new URLSearchParams();
    urlParams.set("success", "true");
    urlParams.set("session_id", sessionId);
    window.courseManager.handleSuccessfulPayment(urlParams);
  }
}

// ==================== SECOND PAGE MANAGER ====================

class SecondPageManager {
  constructor() {
    this.isPaid = false;
    this.currentUser = null;
    console.log("🔍 Second page access check...");
    this.checkAccess();
  }

  checkAccess() {
    // Session ellenőrzés
    const sessionPaid = sessionStorage.getItem("catdog_session_paid");
    const sessionTime = sessionStorage.getItem("catdog_session_time");

    if (sessionPaid === "true" && sessionTime) {
      const sessionAge = Date.now() - parseInt(sessionTime);
      const maxSessionAge = 2 * 60 * 60 * 1000;

      if (sessionAge < maxSessionAge) {
        console.log("✅ Valid session on second page");
        this.isPaid = true;
        this.showContent();
        return;
      }
    }

    // LocalStorage fallback
    const paidStatus = localStorage.getItem("catdog_paid");
    const paymentData = localStorage.getItem("catdog_payment");

    if (paidStatus === "true") {
      this.isPaid = true;
      sessionStorage.setItem("catdog_session_paid", "true");
      sessionStorage.setItem("catdog_session_time", Date.now().toString());
      console.log("✅ LocalStorage access + session set");
      this.showContent();
      return;
    }

    if (paymentData) {
      try {
        const data = JSON.parse(paymentData);
        if (data.verified && new Date() < new Date(data.expiresAt)) {
          this.isPaid = true;
          sessionStorage.setItem("catdog_session_paid", "true");
          sessionStorage.setItem("catdog_session_time", Date.now().toString());
          console.log("✅ Payment data access + session set");
          this.showContent();
          return;
        }
      } catch (e) {
        console.warn("Invalid payment data");
      }
    }

    console.log("❌ No access - redirecting");
    this.showAccessDenied();
  }

  showContent() {
    console.log("✅ Second page content shown");
    document.body.style.display = "block";
    this.unlockSecondPageSidebar();
    this.initFirebaseAuth();

    const targetLesson =
      sessionStorage.getItem("catdog_target_lesson") || "model";
    setTimeout(() => {
      this.showLesson(targetLesson);
    }, 500);
  }

  unlockSecondPageSidebar() {
    console.log("🔓 Unlocking second page sidebar...");

    const sidebarButtons = document.querySelectorAll(
      ".sidebar .lesson-item, nav .lesson-item"
    );
    sidebarButtons.forEach((btn) => {
      btn.classList.remove("locked");
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.pointerEvents = "auto";
      btn.removeAttribute("disabled");
    });

    // CSS override
    const style = document.createElement("style");
    style.textContent = `
      .sidebar .lesson-item,
      nav .lesson-item {
        opacity: 1 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        background: rgba(102, 126, 234, 0.1) !important;
      }
      
      .sidebar .lesson-item:hover,
      nav .lesson-item:hover {
        background: rgba(102, 126, 234, 0.2) !important;
        transform: translateX(5px) !important;
      }
      
      .lesson-item.locked {
        opacity: 1 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(style);

    console.log("✅ Second page sidebar unlocked");
  }

  showLesson(lessonId) {
    console.log("📖 Second page lesson:", lessonId);

    const lessons = document.querySelectorAll(".lesson-content");
    lessons.forEach((lesson) => (lesson.style.display = "none"));

    const buttons = document.querySelectorAll(".lesson-item");
    buttons.forEach((btn) => btn.classList.remove("active"));

    const targetLesson = document.getElementById(lessonId);
    if (targetLesson) {
      targetLesson.style.display = "block";
    }

    const targetButton = document.querySelector(`[onclick*="${lessonId}"]`);
    if (targetButton) {
      targetButton.classList.add("active");
    }
  }

  showAccessDenied() {
    document.body.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: 'Inter', sans-serif;">
        <div style="background: white; padding: 4rem; border-radius: 24px; text-align: center; max-width: 600px; margin: 2rem; box-shadow: 0 30px 80px rgba(0,0,0,0.2);">
          <div style="font-size: 5rem; margin-bottom: 2rem;">🔒</div>
          <h1 style="color: #2d3748; margin-bottom: 1.5rem; font-size: 2.5rem;">Premium Content</h1>
          <p style="color: #4a5568; margin-bottom: 3rem; line-height: 1.6; font-size: 1.2rem;">
            This is the advanced section of the Cat vs Dog AI course. Please purchase the full course to access this content.
          </p>
          
          <div style="background: #f7fafc; padding: 2rem; border-radius: 16px; margin-bottom: 3rem;">
            <h3 style="color: #667eea; margin-bottom: 1rem;">🎯 What You're Missing:</h3>
            <div style="text-align: left; color: #4a5568; font-size: 1.1rem;">
              ✅ Advanced model training techniques<br>
              ✅ Real-time prediction implementation<br>
              ✅ Professional web app development<br>
              ✅ Deployment and sharing strategies<br>
              ✅ Bonus: Advanced AI concepts
            </div>
          </div>
          
          <div style="margin-bottom: 2rem;">
            <a href="catvsdog.html" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 1.2rem 2.5rem; border-radius: 16px; text-decoration: none; font-weight: 700; margin-right: 1rem; display: inline-block; font-size: 1.1rem;">
              🚀 Get Full Access - $7.99
            </a>
            <a href="catvsdog.html" style="background: #e2e8f0; color: #4a5568; padding: 1.2rem 2rem; border-radius: 16px; text-decoration: none; display: inline-block;">
              ← Back to Main Course
            </a>
          </div>

          <div style="margin-top: 2rem;">
            <button onclick="secondPageManager.promptCode()" style="background: #48bb78; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 8px; cursor: pointer; font-weight: 600;">
              🔑 I have a promo code
            </button>
          </div>
        </div>
      </div>
    `;
  }

  promptCode() {
    const code = prompt("Enter your promo code:");
    if (!code) return;

    // Redirect to main page with code
    window.location.href = `catvsdog.html?code=${encodeURIComponent(code)}`;
  }

  async initFirebaseAuth() {
    // Firebase auth ugyanaz mint a főoldalon
    console.log("🔥 Firebase auth initialized for second page");
  }
}

// ==================== INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", function () {
  console.log("🚀 DOM loaded, initializing...");

  // Detect which page we're on
  const isSecondPage = window.location.pathname.includes("catvsdog2.html");

  if (isSecondPage) {
    // Second page initialization
    window.secondPageManager = new SecondPageManager();

    // Global functions for second page
    window.showLesson = (lessonId) => {
      if (window.secondPageManager) {
        window.secondPageManager.showLesson(lessonId);
      }
    };
  } else {
    // Main page initialization
    window.courseManager = new CatDogCourseManager();

    // Debug function globally available
    window.debug = () => window.courseManager.debug();

    // Show default lesson based on payment status
    setTimeout(() => {
      if (window.courseManager.isPaid) {
        window.courseManager.showLesson("training"); // Show training if paid
      } else {
        window.courseManager.showLesson("payment"); // Show payment if not paid
      }
    }, 1000);
  }

  console.log("✅ Course system initialized");
  console.log("💡 Use debug() in console for debugging options");
});

// ==================== GLOBAL ERROR HANDLING ====================

window.addEventListener("error", function (e) {
  console.error("Global error caught:", e.error);

  if (window.courseManager && window.courseManager.analytics) {
    window.courseManager.analytics.track("javascript_error", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  }
});

// ==================== PERFORMANCE MONITORING ====================

window.addEventListener("load", function () {
  setTimeout(() => {
    if (window.courseManager && window.courseManager.analytics) {
      const perfData = performance.getEntriesByType("navigation")[0];
      window.courseManager.analytics.track("page_performance", {
        loadTime: perfData.loadEventEnd - perfData.fetchStart,
        domContentLoaded:
          perfData.domContentLoadedEventEnd - perfData.fetchStart,
        firstContentfulPaint:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime || 0,
      });
    }
  }, 1000);
});

console.log("🎓 Cat vs Dog AI Course System Loaded Successfully!");
console.log(
  "📊 Features: Payment Processing, Progress Tracking, Analytics, Firebase Integration"
);
console.log("🔧 Debug: Type debug() in console for admin functions");

// ADD THIS FUNCTION TO catvsdog-fixed.js
// Helyezd el valahova a global functions szekciónál

// Global function for navigating to second page
function goToSecondPage(lessonId) {
  if (window.courseManager) {
    // Check if user has access
    if (!window.courseManager.isPaid) {
      window.courseManager.showAccessDialog(lessonId);
      return;
    }

    // Store target lesson in session storage
    sessionStorage.setItem("catdog_target_lesson", lessonId);

    // Navigate to second page
    window.location.href = "catvsdog2.html";
  } else {
    console.warn("Course manager not initialized yet");
  }
}

// Alternative: if you want to add it to the CatDogCourseManager class:
// Add this method inside the CatDogCourseManager class:

/*
goToSecondPage(lessonId) {
  console.log(`🔄 Navigating to second page: ${lessonId}`);
  
  // Check access
  if (!this.isPaid) {
    this.showAccessDialog(lessonId);
    return;
  }
  
  // Store target lesson
  sessionStorage.setItem('catdog_target_lesson', lessonId);
  
  // Navigate
  window.location.href = 'catvsdog2.html';
  
  // Analytics
  this.analytics.track('second_page_navigation', {
    targetLesson: lessonId,
    fromPage: 'main'
  });
}
*/
