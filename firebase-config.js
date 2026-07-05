// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBou-W29toWlD9mwTEzgXoUWeriOtr4yb4",
  authDomain: "pointage-heures-455a1.firebaseapp.com",
  projectId: "pointage-heures-455a1",
  storageBucket: "pointage-heures-455a1.firebasestorage.app",
  messagingSenderId: "674815364408",
  appId: "1:674815364408:web:c5bc9597b2a25823a605cd"
};

// Initialisation de Firebase avec la version Compat (pour compatibilité avec app.js)
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
