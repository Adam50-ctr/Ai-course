// Simple User Tracking - enhanced-catvsdog.js
// Csak a jelenlegi catvsdog.js-t bővíti ki

class SimpleCourseManager {
  constructor() {
    this.currentLesson = "payment";
    this.isPaid = false;
    this.completedLessons = [];
    this.userFingerprint = null;
    this.init();
  }

  init() {
    this.generateUserFingerprint();
    this.loadUserData();
    this.checkPaymentStatus();
    this.setupEventListeners();
    console.log(
      "🐱🐶 Simple Course Manager loaded for user:",
      this.userFingerprint
    );
  }

  // Egyedi felhasználó azonosító készítése böngésző alapján
  generateUserFingerprint() {
    // Existing method from your code, enhanced
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("User fingerprint", 2, 2);

    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL(),
      navigator.hardwareConcurrency || "unknown",
      navigator.cookieEnabled ? "cookies" : "no-cookies",
      Date.now(), // Unique session element
    ].join("|");

    this.userFingerprint = btoa(fingerprint)
      .substring(0, 24)
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  // Felhasználói adatok betöltése
  loadUserData() {
    const userData = localStorage.getItem(
      `microai_user_${this.userFingerprint}`
    );

    if (userData) {
      try {
        const data = JSON.parse(userData);
        this.isPaid = data.isPaid || false;
        this.completedLessons = data.completedLessons || [];
        this.currentLesson = data.currentLesson || "payment";

        console.log("📚 User data loaded:", {
          paid: this.isPaid,
          lessons: this.completedLessons.length,
          current: this.currentLesson,
        });
      } catch (error) {
        console.warn("Invalid user data, resetting");
        this.resetUserData();
      }
    }
  }

  // Felhasználói adatok mentése
  saveUserData() {
    const userData = {
      userFingerprint: this.userFingerprint,
      isPaid: this.isPaid,
      completedLessons: this.completedLessons,
      currentLesson: this.currentLesson,
      lastSaved: new Date().toISOString(),
      courseVersion: "1.0",
    };

    localStorage.setItem(
      `microai_user_${this.userFingerprint}`,
      JSON.stringify(userData)
    );

    // Backup to secondary storage
    localStorage.setItem("microai_current_user", JSON.stringify(userData));

    // Send to backend if available (silent fail)
    this.syncToBackend(userData);
  }

  // Fizetés ellenőrzése (enhanced version of your existing method)
  checkPaymentStatus() {
    // 1. URL paraméterek ellenőrzése (Stripe visszatérés)
    const urlParams = new URLSearchParams(window.location.search);

    if (
      urlParams.get("success") === "true" ||
      urlParams.get("payment_status") === "paid"
    ) {
      this.handlePaymentSuccess(urlParams);
      return;
    }

    // 2. LocalStorage ellenőrzése
    const storedPayment = localStorage.getItem(
      `payment_${this.userFingerprint}_catdog`
    );
    if (storedPayment) {
      const paymentData = JSON.parse(storedPayment);

      // Ellenőrizd hogy még érvényes-e
      if (
        paymentData.expiresAt &&
        new Date() < new Date(paymentData.expiresAt)
      ) {
        this.isPaid = true;
        this.unlockAllLessons();
        this.showLesson(this.currentLesson || "intro");
      }
    }

    // 3. Backend ellenőrzés (ha elérhető)
    this.checkWithBackend();
  }

  // Sikeres fizetés kezelése
  handlePaymentSuccess(urlParams) {
    const sessionId =
      urlParams.get("session_id") || urlParams.get("payment_intent");
    const paymentId = sessionId || "payment_" + Date.now();

    // Fizetési adatok tárolása
    const paymentData = {
      paymentId: paymentId,
      userFingerprint: this.userFingerprint,
      purchaseDate: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      course: "catdog",
      amount: 799,
      verified: true,
    };

    localStorage.setItem(
      `payment_${this.userFingerprint}_catdog`,
      JSON.stringify(paymentData)
    );

    // Kurzus feloldása
    this.isPaid = true;
    this.unlockAllLessons();
    this.showSuccessMessage();
    this.saveUserData();

    // URL tisztítása
    window.history.replaceState({}, document.title, window.location.pathname);

    console.log("✅ Payment successful for user:", this.userFingerprint);
  }

  // Lecke megjelenítése (enhanced version)
  showLesson(lessonId) {
    // Minden lecke elrejtése
    const lessons = document.querySelectorAll(".lesson-content");
    lessons.forEach((lesson) => (lesson.style.display = "none"));

    // Aktív gomb eltávolítása
    const buttons = document.querySelectorAll(".lesson-item");
    buttons.forEach((btn) => btn.classList.remove("active"));

    // Hozzáférés ellenőrzése
    if (!this.hasAccess(lessonId)) {
      this.showPaymentRequiredDialog();
      return;
    }

    // Lecke megjelenítése
    const targetLesson = document.getElementById(lessonId);
    if (targetLesson) {
      targetLesson.style.display = "block";
    }

    // Aktív gomb beállítása
    const targetButton = document.querySelector(`[onclick*="${lessonId}"]`);
    if (targetButton) {
      targetButton.classList.add("active");
    }

    this.currentLesson = lessonId;

    // Progress frissítése
    if (this.isPaid && !this.completedLessons.includes(lessonId)) {
      this.completedLessons.push(lessonId);
    }

    this.saveUserData();
  }

  // Hozzáférés ellenőrzése
  hasAccess(lessonId) {
    // Ingyenes leckék
    if (["payment", "basics"].includes(lessonId)) {
      return true;
    }

    // Fizetős leckék
    return this.isPaid;
  }

  // Fizetés szükséges dialog
  showPaymentRequiredDialog() {
    const modal = document.createElement("div");
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

    modal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 12px; max-width: 400px; text-align: center;">
                <h3 style="margin-bottom: 1rem;">🔒 Premium Content</h3>
                <p style="margin-bottom: 1rem; color: #666;">
                    Ez a lecke a kurzus megvásárlását igényli.
                </p>
                <p style="margin-bottom: 2rem; color: #667eea; font-size: 0.9rem;">
                    Felhasználó ID: ${this.userFingerprint}
                </p>
                <button onclick="courseManager.showLesson('payment'); this.closest('[style*=fixed]').remove();" 
                        style="background: #667eea; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; margin-right: 1rem; cursor: pointer;">
                    Kurzus vásárlása
                </button>
                <button onclick="this.closest('[style*=fixed]').remove()" 
                        style="background: #e53e3e; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer;">
                    Bezárás
                </button>
            </div>
        `;

    document.body.appendChild(modal);
  }

  // Minden lecke feloldása
  unlockAllLessons() {
    const lockedItems = document.querySelectorAll(".lesson-item.locked");
    lockedItems.forEach((item) => {
      item.classList.remove("locked");
      item.style.animation = "unlockPulse 0.6s ease-out";
    });

    // Vásárlás gomb frissítése
    const purchaseBtn = document.querySelector('[onclick*="payment"]');
    if (purchaseBtn) {
      purchaseBtn.innerHTML = "✅ Kurzus megvásárolva";
      purchaseBtn.style.background = "#48bb78";
    }
  }

  // Sikeres vásárlás üzenet
  showSuccessMessage() {
    const successDiv = document.createElement("div");
    successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #48bb78, #38a169);
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 1001;
            animation: slideInRight 0.5s ease-out;
        `;

    successDiv.innerHTML = `
            <strong>🎉 Sikeres vásárlás!</strong><br>
            Minden lecke feloldva!<br>
            <small>Felhasználó: ${this.userFingerprint}</small>
        `;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      successDiv.remove();
      this.showLesson("intro");
    }, 3000);
  }

  // Következő lecke
  nextLesson() {
    const lessons = [
      "intro",
      "basics",
      "setup",
      "data",
      "model",
      "training",
      "prediction",
      "app",
      "extras",
    ];
    const currentIndex = lessons.indexOf(this.currentLesson);

    if (currentIndex < lessons.length - 1) {
      const nextLessonId = lessons[currentIndex + 1];
      this.showLesson(nextLessonId);

      // Görgetés tetejére
      document.querySelector(".content-area").scrollTop = 0;
    }
  }

  // Manuális ellenőrző kód
  verifyManualCode() {
    const code = prompt("Add meg az ellenőrző kódot:");
    if (!code) return;

    const demoCodes = ["DEMO123", "TEST456", "PREVIEW789", "CATDOG2024"];

    if (demoCodes.includes(code.toUpperCase()) || code.length >= 10) {
      // Fizetési adatok mentése
      const paymentData = {
        paymentId: code,
        userFingerprint: this.userFingerprint,
        purchaseDate: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        course: "catdog",
        method: "manual",
        verified: true,
      };

      localStorage.setItem(
        `payment_${this.userFingerprint}_catdog`,
        JSON.stringify(paymentData)
      );

      this.isPaid = true;
      this.unlockAllLessons();
      this.showSuccessMessage();
      this.saveUserData();

      console.log("✅ Manual verification successful");
    } else {
      alert("Érvénytelen kód!");
    }
  }

  // Backend szinkronizálás (opcionális)
  async syncToBackend(userData) {
    try {
      await fetch("/api/sync-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });
    } catch (error) {
      // Csendes fail - nem probléma ha nincs backend
      console.warn("Backend sync failed (not critical)");
    }
  }

  async checkWithBackend() {
    try {
      const response = await fetch(`/api/check-user/${this.userFingerprint}`);
      if (response.ok) {
        const result = await response.json();
        if (result.hasPaid) {
          this.isPaid = true;
          this.unlockAllLessons();
          this.saveUserData();
        }
      }
    } catch (error) {
      // Nem gond ha nincs backend
    }
  }

  // Event listener-ek
  setupEventListeners() {
    // Automatikus mentés 30 másodpercenként
    setInterval(() => this.saveUserData(), 30000);

    // Ablak bezárásakor mentés
    window.addEventListener("beforeunload", () => this.saveUserData());

    // Storage változás figyelése (több tab)
    window.addEventListener("storage", (e) => {
      if (e.key === `microai_user_${this.userFingerprint}`) {
        this.loadUserData();
      }
    });
  }

  // Adatok alaphelyzetbe állítása
  resetUserData() {
    localStorage.removeItem(`microai_user_${this.userFingerprint}`);
    localStorage.removeItem(`payment_${this.userFingerprint}_catdog`);
    this.isPaid = false;
    this.completedLessons = [];
    this.currentLesson = "payment";
  }

  // Státusz lekérdezése
  getStatus() {
    return {
      userFingerprint: this.userFingerprint,
      isPaid: this.isPaid,
      currentLesson: this.currentLesson,
      completedLessons: this.completedLessons.length,
      allLessons: this.completedLessons,
    };
  }
}

// Inicializálás
document.addEventListener("DOMContentLoaded", function () {
  window.courseManager = new SimpleCourseManager();

  // Globális függvények felülírása
  window.showLesson = (lessonId) => window.courseManager.showLesson(lessonId);
  window.nextLesson = () => window.courseManager.nextLesson();

  // Debug funkciók
  window.courseDebug = {
    status: () => console.log(window.courseManager.getStatus()),
    unlock: () => {
      window.courseManager.isPaid = true;
      window.courseManager.unlockAllLessons();
      window.courseManager.saveUserData();
      console.log("🔓 Course unlocked for debugging");
    },
    reset: () => {
      window.courseManager.resetUserData();
      location.reload();
    },
    verify: () => window.courseManager.verifyManualCode(),
  };
});

// CSS animációk
const style = document.createElement("style");
style.textContent = `
    @keyframes unlockPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); background: #48bb78; color: white; }
        100% { transform: scale(1); }
    }
    
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

console.log("🚀 Simple Course Manager Loaded");
console.log("Debug tools: window.courseDebug");
