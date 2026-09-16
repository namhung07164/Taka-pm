const { initializeApp } = require("firebase/app");
const { getAuth, signInAnonymously } = require("firebase/auth");
const { getFirestore, collection, getDocs, query, where } = require("firebase/firestore");

const firebaseConfigProd = {
    apiKey: "AIzaSyCsL4MZ76PLxV5-n0BHHLyb5dR_p5UmvTc",
    projectId: "taka---projec-1",
};

async function testDB() {
    const app = initializeApp(firebaseConfigProd);
    const auth = getAuth(app);
    const db = getFirestore(app);
    await signInAnonymously(auth);
    const colRef = collection(db, "artifacts", "taka-projects-app-v1", "public", "data", "taka_projects");
    
    const snapshot = await getDocs(colRef);
    if (snapshot.size > 0) {
        const data = snapshot.docs[0].data();
        console.log("Sample Project data:", JSON.stringify(data, null, 2));
    } else {
        console.log("No projects found in PROD");
    }
}

testDB().then(() => process.exit(0));
