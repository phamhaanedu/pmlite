// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, query, where, or, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch, deleteDoc, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEwcdSpMXl_VxmuCKNDPLgHA4tAXyr-hU",
  authDomain: "simple-project-manager-anph21.firebaseapp.com",
  projectId: "simple-project-manager-anph21",
  storageBucket: "simple-project-manager-anph21.firebasestorage.app",
  messagingSenderId: "226849837151",
  appId: "1:226849837151:web:9b46a2cb41d1dde2ea4bea",
  measurementId: "G-TGJ5GL69X8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, query, where, or, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch, deleteDoc, onSnapshot, addDoc, serverTimestamp };
