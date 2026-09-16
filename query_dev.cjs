const { initializeApp } = require("firebase/app");
const { getAuth, signInAnonymously } = require("firebase/auth");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

const firebaseConfigDev = {
  apiKey: "AIzaSyAaPtg8mZabKUJ6E2xz2KrBjQSfnHICjgc",
  projectId: "tak-project---ver1",
};

async function testDB() {
    const app = initializeApp(firebaseConfigDev);
    const auth = getAuth(app);
    const db = getFirestore(app);
    await signInAnonymously(auth);
    const colRef = collection(db, "artifacts", "taka-projects-app-v1", "public", "data", "taka_projects");
    
    const snapshot = await getDocs(colRef);
    snapshot.forEach(doc => {
        console.log("DEV Project:", doc.data().name, "Year:", doc.data().year, "Store:", doc.data().store);
    });
}

testDB().then(() => process.exit(0));
