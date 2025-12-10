import * as path from 'node:path';
import * as url from 'node:url';
import cors from 'cors';
import { default as express } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

const port = process.env.PORT || 8000;

let app = express();
app.use(express.json());

app.use(cors());  // Use the cors package you imported

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
    
    let query = 'SELECT code, incident_type as type FROM Codes';
    let params = [];
    let conditions = [];
    

    if (req.query.code) {
        let codes = req.query.code.split(',').map(c => parseInt(c.trim()));
        conditions.push(`code IN (${codes.map(() => '?').join(',')})`);
        params.push(...codes);
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY code';
    
    dbSelect(query, params).then((codes) => {
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
    
    let query = 'SELECT neighborhood_number as id, neighborhood_name as name FROM Neighborhoods';
    let params = [];
    let conditions = [];
    
    if (req.query.id) {
        let ids = req.query.id.split(',').map(id => parseInt(id.trim()));
        conditions.push(`neighborhood_number IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY neighborhood_number';
    
    dbSelect(query, params).then((neighborhoods) => {
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
                 FROM Incidents`;
    let params = [];
    let conditions = [];
    
    // Filter by start_date if provided
    if (req.query.start_date) {
        conditions.push(`date(date_time) >= ?`);
        params.push(req.query.start_date);
    }
    
    // Filter by end_date if provided
    if (req.query.end_date) {
        conditions.push(`date(date_time) <= ?`);
        params.push(req.query.end_date);
    }
    
    // Filter by code if provided (comma separated list)
    if (req.query.code) {
        let codes = req.query.code.split(',').map(c => parseInt(c.trim()));
        conditions.push(`code IN (${codes.map(() => '?').join(',')})`);
        params.push(...codes);
    }
    
    // Filter by grid if provided (comma separated list)
    if (req.query.grid) {
        let grids = req.query.grid.split(',').map(g => parseInt(g.trim()));
        conditions.push(`police_grid IN (${grids.map(() => '?').join(',')})`);
        params.push(...grids);
    }
    
    // Filter by neighborhood if provided (comma separated list)
    if (req.query.neighborhood) {
        let neighborhoods = req.query.neighborhood.split(',').map(n => parseInt(n.trim()));
        conditions.push(`neighborhood_number IN (${neighborhoods.map(() => '?').join(',')})`);
        params.push(...neighborhoods);
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY date_time DESC';
    
    // Apply limit (default 1000)
    let limit = 1000;
    if (req.query.limit) {
        limit = parseInt(req.query.limit);
    }
    query += ` LIMIT ?`;
    params.push(limit);
    
    dbSelect(query, params).then((incidents) => {
        res.status(200).type('json').send(JSON.stringify(incidents, null, 2));
    }).catch((err) => {
        console.error(err);
        res.status(500).type('txt').send('Error retrieving incidents');
    });
});

// PUT request handler for new crime incident
app.put('/new-incident', async (req, res) => {
    console.log(req.body); // uploaded data
    
    try {
        const { case_number, date, time, code, incident, police_grid, neighborhood_number, block } = req.body;
        
        // Check if case_number already exists
        const existingCase = await dbSelect('SELECT case_number FROM Incidents WHERE case_number = ?', [case_number]);
        
        if (existingCase.length > 0) {
            return res.status(500).type('txt').send('Case number already exists in database');
        }
        
        // Combine date and time into SQLite datetime format
        const date_time = `${date} ${time}`;
        
        // Insert new incident
        const insertQuery = `INSERT INTO Incidents (case_number, date_time, code, incident, police_grid, neighborhood_number, block) 
                             VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        await dbRun(insertQuery, [case_number, date_time, code, incident, police_grid, neighborhood_number, block]);
        
        res.status(200).type('txt').send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).type('txt').send('Error inserting incident');
    }
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', async (req, res) => {
    console.log(req.body); // uploaded data
    
    try {
        const { case_number } = req.body;
        
       // console.log('Attempting to delete case_number:', case_number);
        
        // Check if case_number exists
        const existingCase = await dbSelect('SELECT case_number FROM Incidents WHERE case_number = ?', [case_number]);
        
       // console.log('Found records:', existingCase.length);
        
        if (existingCase.length === 0) {
            return res.status(500).type('txt').send('Case number does not exist in database');
        }
        
        // Delete the incident
        const deleteQuery = 'DELETE FROM Incidents WHERE case_number = ?';
        await dbRun(deleteQuery, [case_number]);
        
       // console.log('Deleted case_number:', case_number);
        
        res.status(200).type('txt').send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).type('txt').send('Error deleting incident');
    }
});


/********************************************************************
 ***   START SERVER                                               *** 
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
