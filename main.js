// main.js
import { register, login } from "./auth.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const status = document.getElementById("authStatus");

document.getElementById("registerBtn").addEventListener("click", () => {
  register(emailInput.value, passwordInput.value)
    .then(() => {
      status.textContent = "✅ Sikeres regisztráció!";
    })
    .catch((err) => {
      status.textContent = "❌ Hiba: " + err.message;
    });
});

document.getElementById("loginBtn").addEventListener("click", () => {
  login(emailInput.value, passwordInput.value)
    .then(() => {
      status.textContent = "✅ Sikeres bejelentkezés!";
    })
    .catch((err) => {
      status.textContent = "❌ Hiba: " + err.message;
    });
});
