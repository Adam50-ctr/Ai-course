// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC-bQG1j2xsRiBxU8emivr6rxrGwV7sj6g",
  authDomain: "micro-ai-projects.firebaseapp.com",
  projectId: "micro-ai-projects",
  storageBucket: "micro-ai-projects.firebasestorage.app",
  messagingSenderId: "903965915050",
  appId: "1:903965915050:web:6f8103f88bc556c7dc1dd3",
  measurementId: "G-NWJB1LW4J9",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export default app;
