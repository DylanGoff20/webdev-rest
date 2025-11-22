import * as path from 'node:path';
import * as url from 'node:url';

import { default as express } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

const port = 8000;

let app = express();
app.use(express.json());

/********************************************************************
 ***   DATABASE FUNCTIONS                                         *** 
 ********************************************************************/
// Open SQLite3 database (in read-write mode)
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.log('Error opening ' + path.basename(db_filename));
    }
    else {
        console.log('Now connected to ' + path.basename(db_filename));
    }
});

// Create Promise for SQLite3 database SELECT query 
function dbSelect(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows);
            }
        });
    });
}

// Create Promise for SQLite3 database INSERT or DELETE query
function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

/********************************************************************
 ***   REST REQUEST HANDLERS                                      *** 
 ********************************************************************/

app.get('/codes', (req, res) => {
    console.log(req.query);
    
    let query = 'SELECT code, incident_type as type FROM Codes ORDER BY code';
    
    dbSelect(query, []).then((codes) => {
        if ('format' in req.query && req.query.format === 'plain') {
            res.status(200).type('json').send(codes);
        } else {
            res.status(200).type('json').send('[\n' + codes.map(c => '  ' + JSON.stringify(c)).join(',\n') + '\n]');
        }
    }).catch((err) => {
        console.error(err);
        res.status(500).type('txt').send('Error retrieving codes');
    });
});


app.get('/neighborhoods', (req, res) => {
    console.log(req.query); 
    
    let query = 'SELECT neighborhood_number as id, neighborhood_name as name FROM Neighborhoods ORDER BY neighborhood_number';
    
    dbSelect(query, []).then((neighborhoods) => {
        if ('format' in req.query && req.query.format === 'plain') {
            res.status(200).type('json').send(neighborhoods);
        } else {
            res.status(200).type('json').send('[\n' + neighborhoods.map(n => '  ' + JSON.stringify(n)).join(',\n') + '\n]');
        }
    }).catch((err) => {
        console.error(err);
        res.status(500).type('txt').send('Error retrieving neighborhoods');
    });
});


app.get('/incidents', (req, res) => {
    console.log(req.query); 
    
    let query = `SELECT case_number, 
                 date(date_time) as date, 
                 time(date_time) as time, 
                 code, 
                 incident, 
                 police_grid, 
                 neighborhood_number, 
                 block 
                 FROM Incidents 
                 ORDER BY date_time DESC 
                 LIMIT 1000`;
    
    dbSelect(query, []).then((incidents) => {
        res.status(200).type('json').send(JSON.stringify(incidents, null, 2));
    }).catch((err) => {
        console.error(err);
        res.status(500).type('txt').send('Error retrieving incidents');
    });
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

/********************************************************************
 ***   START SERVER                                               *** 
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
