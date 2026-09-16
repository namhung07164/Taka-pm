const { initializeApp } = require("firebase/app");
const { getAuth, signInAnonymously } = require("firebase/auth");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

const firebaseConfigProd = {
    apiKey: "AIzaSyCsL4MZ76PLxV5-n0BHHLyb5dR_p5UmvTc",
    projectId: "taka---projec-1",
};

const firebaseConfigDev = {
  apiKey: "AIzaSyAaPtg8mZabKUJ6E2xz2KrBjQSfnHICjgc",
  projectId: "tak-project---ver1",
};

async function testDB(config, name) {
    console.log(`Testing ${name}...`);
    const app = initializeApp(config, name);
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    try {
        await signInAnonymously(auth);
        const colRef = collection(db, "artifacts", "taka-projects-app-v1", "public", "data", "taka_projects");
        const snapshot = await getDocs(colRef);
        console.log(`${name} projects count:`, snapshot.size);
    } catch(e) {
        console.log(`Error in ${name}:`, e.message);
    }
}

async function run() {
    await testDB(firebaseConfigDev, "DEV");
    await testDB(firebaseConfigProd, "PROD");
    process.exit(0);
}
run();
