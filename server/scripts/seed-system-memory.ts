import "dotenv/config";
import { seedKnownBugs } from "../systemMemory";

await seedKnownBugs();
console.log("system memory seeded");
