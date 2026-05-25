const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const dbPath = path.resolve(__dirname, 'server/data/database.sqlite');

async function inspectDb() {
    console.log("=== INSPECTING SQLITE DATABASE IN WORKSPACE ===");
    
    if (!fs.existsSync(dbPath)) {
        console.log("Database file does not exist yet at path:", dbPath);
        return;
    }

    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Connection failed:", err.message);
            return;
        }

        db.all("SELECT * FROM account_pin", [], (err1, rows) => {
            if (err1) {
                console.error("Failed to query account_pin:", err1.message);
            } else {
                console.log("\n--- account_pin table rows ---");
                console.log(JSON.stringify(rows, null, 2));
            }

            db.all("SELECT * FROM meter_history", [], (err2, logRows) => {
                if (err2) {
                    console.error("Failed to query meter_history:", err2.message);
                } else {
                    console.log("\n--- meter_history table rows ---");
                    console.log(JSON.stringify(logRows, null, 2));
                }

                db.close();
            });
        });
    });
}

inspectDb();
