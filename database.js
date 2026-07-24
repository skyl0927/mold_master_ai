const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;

const NON_DIAGNOSTIC_DEFECT_PATTERNS = [
    /^report verified$/i,
    /^verified report$/i,
    /^review(ed)?( report| artifact)?$/i,
    /^human review$/i,
    /^approved$/i,
    /^rejected$/i
];

function ensureDatabase() {
    if (!db) {
        throw new Error('Database is not initialized');
    }
    return db;
}

function isDiagnosticKnowledgeCandidate(record) {
    if (!record) return false;

    const knowledgeScope = String(record.knowledge_scope || 'diagnostic').toLowerCase();
    if (knowledgeScope !== 'diagnostic') {
        return false;
    }

    const defectType = String(record.defect_type || '').trim();
    if (!defectType) {
        return false;
    }

    if (NON_DIAGNOSTIC_DEFECT_PATTERNS.some((pattern) => pattern.test(defectType))) {
        return false;
    }

    const combinedText = [
        record.description,
        record.possible_causes,
        record.countermeasures
    ].filter(Boolean).join(' ').trim();

    return combinedText.length > 0;
}

function initDatabase(userDataPath) {
    const dbDir = path.join(userDataPath, 'MoldMasterDB');
    fs.mkdirSync(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, 'moldmaster.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    createTables();
    migrateSchema();

    console.log('SQLite Database Initialized at:', dbPath);
    return db;
}

function createTables() {
    const database = ensureDatabase();

    database.exec(`
        CREATE TABLE IF NOT EXISTS defect_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id TEXT NOT NULL,
            image_path TEXT,
            defect_type TEXT,
            severity TEXT,
            description TEXT,
            possible_causes TEXT,
            countermeasures TEXT,
            raw_output TEXT,
            status TEXT DEFAULT 'pending',
            is_verified INTEGER DEFAULT 0,
            verified_by TEXT,
            knowledge_scope TEXT DEFAULT 'diagnostic',
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vector_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            chunk_index INTEGER,
            content TEXT,
            embedding TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS training_set (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_path TEXT NOT NULL,
            defect_type TEXT,
            severity TEXT,
            annotations TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS knowledge_matrix (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_sheet TEXT NOT NULL,
            source_row INTEGER,
            product_group TEXT NOT NULL,
            process_group TEXT NOT NULL,
            issue_family TEXT NOT NULL,
            issue_name TEXT NOT NULL,
            symptom_text TEXT,
            cause_hypotheses TEXT,
            countermeasure_text TEXT,
            design_checks TEXT,
            machining_checks TEXT,
            assembly_checks TEXT,
            measurement_checks TEXT,
            trial_checks TEXT,
            common_actions TEXT,
            learning_source TEXT DEFAULT 'process_matrix',
            feedback_record_id INTEGER,
            raw_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_defect_type ON defect_records(defect_type);
        CREATE INDEX IF NOT EXISTS idx_severity ON defect_records(severity);
        CREATE INDEX IF NOT EXISTS idx_status ON defect_records(status);
        CREATE INDEX IF NOT EXISTS idx_created_at ON defect_records(created_at);
        CREATE INDEX IF NOT EXISTS idx_vector_filename ON vector_store(file_name);
        CREATE INDEX IF NOT EXISTS idx_knowledge_product ON knowledge_matrix(product_group);
        CREATE INDEX IF NOT EXISTS idx_knowledge_process ON knowledge_matrix(process_group);
        CREATE INDEX IF NOT EXISTS idx_knowledge_family ON knowledge_matrix(issue_family);
        CREATE INDEX IF NOT EXISTS idx_knowledge_issue ON knowledge_matrix(issue_name);
        CREATE INDEX IF NOT EXISTS idx_knowledge_learning_source ON knowledge_matrix(learning_source);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_feedback_record ON knowledge_matrix(feedback_record_id);
    `);
}

function addColumnIfMissing(tableName, columnName, ddl) {
    const database = ensureDatabase();
    const columns = database.pragma(`table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
        database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
    }
}

function migrateSchema() {
    const database = ensureDatabase();

    addColumnIfMissing('defect_records', 'is_verified', 'is_verified INTEGER DEFAULT 0');
    addColumnIfMissing('defect_records', 'verified_by', 'verified_by TEXT');
    addColumnIfMissing('defect_records', 'knowledge_scope', "knowledge_scope TEXT DEFAULT 'diagnostic'");
    addColumnIfMissing('defect_records', 'sync_status', "sync_status TEXT DEFAULT 'pending'");

    addColumnIfMissing('knowledge_matrix', 'symptom_text', 'symptom_text TEXT');
    addColumnIfMissing('knowledge_matrix', 'cause_hypotheses', 'cause_hypotheses TEXT');
    addColumnIfMissing('knowledge_matrix', 'countermeasure_text', 'countermeasure_text TEXT');
    addColumnIfMissing('knowledge_matrix', 'learning_source', "learning_source TEXT DEFAULT 'process_matrix'");
    addColumnIfMissing('knowledge_matrix', 'feedback_record_id', 'feedback_record_id INTEGER');

    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_feedback_record_id ON knowledge_matrix(feedback_record_id)');
}

const defects = {
    create(data) {
        const database = ensureDatabase();
        const stmt = database.prepare(`
            INSERT INTO defect_records (
                image_id,
                image_path,
                defect_type,
                severity,
                description,
                possible_causes,
                countermeasures,
                raw_output,
                status,
                is_verified,
                verified_by,
                knowledge_scope,
                sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            data.imageId || data.image_id,
            data.imagePath || data.image_path || null,
            data.defectType || data.defect_type || null,
            data.severity || null,
            data.description || null,
            data.possibleCauses || data.possible_causes || null,
            data.countermeasures || null,
            data.rawOutput || data.raw_output || null,
            data.status || 'pending',
            data.isVerified ? 1 : 0,
            data.verifiedBy || null,
            data.knowledgeScope || data.knowledge_scope || 'diagnostic',
            data.syncStatus || 'pending'
        );

        return result.lastInsertRowid;
    },

    findById(id) {
        return ensureDatabase().prepare('SELECT * FROM defect_records WHERE id = ?').get(id);
    },

    findAll(options = {}) {
        let sql = 'SELECT * FROM defect_records WHERE 1=1';
        const params = [];

        if (options.defectType) {
            sql += ' AND defect_type = ?';
            params.push(options.defectType);
        }
        if (options.severity) {
            sql += ' AND severity = ?';
            params.push(options.severity);
        }
        if (options.status) {
            sql += ' AND status = ?';
            params.push(options.status);
        }
        if (options.fromDate) {
            sql += ' AND created_at >= ?';
            params.push(options.fromDate);
        }
        if (options.toDate) {
            sql += ' AND created_at <= ?';
            params.push(options.toDate);
        }
        if (options.isVerified !== undefined) {
            sql += ' AND is_verified = ?';
            params.push(options.isVerified ? 1 : 0);
        }

        sql += ' ORDER BY created_at DESC';

        if (options.limit) {
            sql += ' LIMIT ?';
            params.push(options.limit);
        }

        return ensureDatabase().prepare(sql).all(...params);
    },

    update(id, data) {
        const fields = [];
        const params = [];

        if (data.defectType !== undefined) { fields.push('defect_type = ?'); params.push(data.defectType); }
        if (data.severity !== undefined) { fields.push('severity = ?'); params.push(data.severity); }
        if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
        if (data.possibleCauses !== undefined) { fields.push('possible_causes = ?'); params.push(data.possibleCauses); }
        if (data.countermeasures !== undefined) { fields.push('countermeasures = ?'); params.push(data.countermeasures); }
        if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
        if (data.isVerified !== undefined) { fields.push('is_verified = ?'); params.push(data.isVerified ? 1 : 0); }
        if (data.verifiedBy !== undefined) { fields.push('verified_by = ?'); params.push(data.verifiedBy); }
        if (data.knowledgeScope !== undefined) { fields.push('knowledge_scope = ?'); params.push(data.knowledgeScope); }
        if (data.knowledge_scope !== undefined) { fields.push('knowledge_scope = ?'); params.push(data.knowledge_scope); }
        if (data.syncStatus !== undefined) { fields.push('sync_status = ?'); params.push(data.syncStatus); }

        if (fields.length === 0) {
            return false;
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const result = ensureDatabase()
            .prepare(`UPDATE defect_records SET ${fields.join(', ')} WHERE id = ?`)
            .run(...params);

        return result.changes > 0;
    },

    delete(id) {
        const result = ensureDatabase().prepare('DELETE FROM defect_records WHERE id = ?').run(id);
        return result.changes > 0;
    },

    search(query) {
        const term = `%${query}%`;
        return ensureDatabase().prepare(`
            SELECT * FROM defect_records
            WHERE defect_type LIKE ?
               OR description LIKE ?
               OR possible_causes LIKE ?
               OR countermeasures LIKE ?
            ORDER BY created_at DESC
        `).all(term, term, term, term);
    },

    getStats() {
        const database = ensureDatabase();
        const total = database.prepare('SELECT COUNT(*) AS count FROM defect_records').get().count;

        const byType = {};
        for (const row of database.prepare('SELECT defect_type, COUNT(*) AS count FROM defect_records GROUP BY defect_type').all()) {
            if (row.defect_type) byType[row.defect_type] = row.count;
        }

        const bySeverity = {};
        for (const row of database.prepare('SELECT severity, COUNT(*) AS count FROM defect_records GROUP BY severity').all()) {
            if (row.severity) bySeverity[row.severity] = row.count;
        }

        const byStatus = {};
        for (const row of database.prepare('SELECT status, COUNT(*) AS count FROM defect_records GROUP BY status').all()) {
            if (row.status) byStatus[row.status] = row.count;
        }

        const recentTrend = database.prepare(`
            SELECT date(created_at) AS date, COUNT(*) AS count
            FROM defect_records
            WHERE created_at >= date('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `).all();

        return { total, byType, bySeverity, byStatus, recentTrend };
    }
};

const vectors = {
    save(chunks) {
        const database = ensureDatabase();
        const deleteStmt = database.prepare('DELETE FROM vector_store');
        const insertStmt = database.prepare(`
            INSERT INTO vector_store (file_name, chunk_index, content, embedding)
            VALUES (?, ?, ?, ?)
        `);

        const tx = database.transaction((items) => {
            deleteStmt.run();
            items.forEach((chunk, index) => {
                insertStmt.run(
                    chunk.fileName || chunk.file_name || chunk.sourceFileName || 'unknown',
                    chunk.chunkIndex || chunk.chunk_index || index,
                    chunk.content || chunk.text || '',
                    JSON.stringify(chunk.embedding || [])
                );
            });
        });

        tx(chunks);
        return true;
    },

    getAll() {
        return ensureDatabase().prepare('SELECT * FROM vector_store ORDER BY file_name, chunk_index').all().map((row) => ({
            id: row.id,
            fileName: row.file_name,
            chunkIndex: row.chunk_index,
            content: row.content,
            embedding: JSON.parse(row.embedding || '[]')
        }));
    },

    clear() {
        ensureDatabase().prepare('DELETE FROM vector_store').run();
        return true;
    },

    getLoadedFiles() {
        return ensureDatabase().prepare('SELECT DISTINCT file_name FROM vector_store ORDER BY file_name').all().map((row) => row.file_name);
    },

    count() {
        return ensureDatabase().prepare('SELECT COUNT(*) AS count FROM vector_store').get().count;
    }
};

const trainingSet = {
    add(data) {
        const result = ensureDatabase().prepare(`
            INSERT INTO training_set (image_path, defect_type, severity, annotations)
            VALUES (?, ?, ?, ?)
        `).run(
            data.imagePath || data.image_path,
            data.defectType || data.defect_type || null,
            data.severity || null,
            JSON.stringify(data.annotations || {})
        );

        return result.lastInsertRowid;
    },

    getAll() {
        return ensureDatabase().prepare('SELECT * FROM training_set ORDER BY created_at DESC').all().map((row) => ({
            ...row,
            annotations: JSON.parse(row.annotations || '{}')
        }));
    },

    count() {
        return ensureDatabase().prepare('SELECT COUNT(*) AS count FROM training_set').get().count;
    }
};

const knowledgeMatrix = {
    replaceAll(records) {
        const database = ensureDatabase();
        const deleteStmt = database.prepare('DELETE FROM knowledge_matrix');
        const insertStmt = database.prepare(`
            INSERT INTO knowledge_matrix (
                source_sheet,
                source_row,
                product_group,
                process_group,
                issue_family,
                issue_name,
                symptom_text,
                cause_hypotheses,
                countermeasure_text,
                design_checks,
                machining_checks,
                assembly_checks,
                measurement_checks,
                trial_checks,
                common_actions,
                learning_source,
                feedback_record_id,
                raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const tx = database.transaction((items) => {
            deleteStmt.run();
            items.forEach((item) => {
                insertStmt.run(
                    item.sourceSheet || item.source_sheet || 'unknown',
                    item.sourceRow || item.source_row || null,
                    item.productGroup || item.product_group || 'unknown',
                    item.processGroup || item.process_group || 'unknown',
                    item.issueFamily || item.issue_family || 'unknown',
                    item.issueName || item.issue_name || 'unknown',
                    item.symptomText || item.symptom_text || null,
                    item.causeHypotheses || item.cause_hypotheses || null,
                    item.countermeasureText || item.countermeasure_text || null,
                    item.designChecks || item.design_checks || null,
                    item.machiningChecks || item.machining_checks || null,
                    item.assemblyChecks || item.assembly_checks || null,
                    item.measurementChecks || item.measurement_checks || null,
                    item.trialChecks || item.trial_checks || null,
                    item.commonActions || item.common_actions || null,
                    item.learningSource || item.learning_source || 'process_matrix',
                    item.feedbackRecordId || item.feedback_record_id || null,
                    item.rawJson || item.raw_json || JSON.stringify(item)
                );
            });
        });

        tx(records);
        return records.length;
    },

    getAll(filter = {}) {
        let sql = 'SELECT * FROM knowledge_matrix WHERE 1=1';
        const params = [];

        if (filter.productGroup) {
            sql += ' AND product_group = ?';
            params.push(filter.productGroup);
        }
        if (filter.processGroup) {
            sql += ' AND process_group = ?';
            params.push(filter.processGroup);
        }
        if (filter.issueFamily) {
            sql += ' AND issue_family = ?';
            params.push(filter.issueFamily);
        }
        if (filter.issueName) {
            sql += ' AND issue_name = ?';
            params.push(filter.issueName);
        }

        sql += ' ORDER BY product_group, process_group, issue_family, issue_name';

        return ensureDatabase().prepare(sql).all(...params).map((row) => ({
            id: row.id,
            sourceSheet: row.source_sheet,
            sourceRow: row.source_row,
            productGroup: row.product_group,
            processGroup: row.process_group,
            issueFamily: row.issue_family,
            issueName: row.issue_name,
            symptomText: row.symptom_text,
            causeHypotheses: row.cause_hypotheses,
            countermeasureText: row.countermeasure_text,
            designChecks: row.design_checks,
            machiningChecks: row.machining_checks,
            assemblyChecks: row.assembly_checks,
            measurementChecks: row.measurement_checks,
            trialChecks: row.trial_checks,
            commonActions: row.common_actions,
            learningSource: row.learning_source,
            feedbackRecordId: row.feedback_record_id,
            rawJson: row.raw_json
        }));
    },

    count() {
        return ensureDatabase().prepare('SELECT COUNT(*) AS count FROM knowledge_matrix').get().count;
    },

    upsertFeedbackLearning(record) {
        if (!isDiagnosticKnowledgeCandidate(record)) {
            return false;
        }

        const normalized = {
            sourceSheet: 'HITL_FEEDBACK',
            sourceRow: null,
            productGroup: 'FIELD_FEEDBACK',
            processGroup: 'Human Review',
            issueFamily: record.defect_type || 'Reviewed Defect',
            issueName: record.defect_type || 'Reviewed Defect',
            symptomText: record.description || null,
            causeHypotheses: record.possible_causes || null,
            countermeasureText: record.countermeasures || null,
            designChecks: null,
            machiningChecks: null,
            assemblyChecks: null,
            measurementChecks: null,
            trialChecks: record.possible_causes || null,
            commonActions: record.countermeasures || null,
            learningSource: 'hitl_feedback',
            feedbackRecordId: record.id,
            rawJson: JSON.stringify({
                feedbackRecordId: record.id,
                defectType: record.defect_type,
                severity: record.severity,
                description: record.description,
                possibleCauses: record.possible_causes,
                countermeasures: record.countermeasures,
                status: record.status
            })
        };

        ensureDatabase().prepare(`
            INSERT INTO knowledge_matrix (
                source_sheet,
                source_row,
                product_group,
                process_group,
                issue_family,
                issue_name,
                symptom_text,
                cause_hypotheses,
                countermeasure_text,
                design_checks,
                machining_checks,
                assembly_checks,
                measurement_checks,
                trial_checks,
                common_actions,
                learning_source,
                feedback_record_id,
                raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(feedback_record_id) DO UPDATE SET
                issue_family = excluded.issue_family,
                issue_name = excluded.issue_name,
                symptom_text = excluded.symptom_text,
                cause_hypotheses = excluded.cause_hypotheses,
                countermeasure_text = excluded.countermeasure_text,
                trial_checks = excluded.trial_checks,
                common_actions = excluded.common_actions,
                learning_source = excluded.learning_source,
                raw_json = excluded.raw_json
        `).run(
            normalized.sourceSheet,
            normalized.sourceRow,
            normalized.productGroup,
            normalized.processGroup,
            normalized.issueFamily,
            normalized.issueName,
            normalized.symptomText,
            normalized.causeHypotheses,
            normalized.countermeasureText,
            normalized.designChecks,
            normalized.machiningChecks,
            normalized.assemblyChecks,
            normalized.measurementChecks,
            normalized.trialChecks,
            normalized.commonActions,
            normalized.learningSource,
            normalized.feedbackRecordId,
            normalized.rawJson
        );

        return true;
    },

    deleteFeedbackLearning(feedbackRecordId) {
        return ensureDatabase().prepare('DELETE FROM knowledge_matrix WHERE feedback_record_id = ?').run(feedbackRecordId).changes > 0;
    },

    syncApprovedFeedback() {
        const database = ensureDatabase();
        database.prepare("DELETE FROM knowledge_matrix WHERE learning_source = 'hitl_feedback'").run();

        const approvedRecords = database.prepare(`
            SELECT * FROM defect_records
            WHERE status = 'approved' OR is_verified = 1
        `).all();

        const tx = database.transaction((items) => {
            items.forEach((item) => {
                if (isDiagnosticKnowledgeCandidate(item)) {
                    knowledgeMatrix.upsertFeedbackLearning(item);
                }
            });
        });

        tx(approvedRecords);
        return approvedRecords.length;
    }
};

function migrateFromJson(jsonPath) {
    if (!fs.existsSync(jsonPath)) {
        return { migrated: 0 };
    }

    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        if (!Array.isArray(data) || data.length === 0) {
            return { migrated: 0 };
        }

        const existingCount = ensureDatabase().prepare('SELECT COUNT(*) AS count FROM defect_records').get().count;
        if (existingCount > 0) {
            return { migrated: 0, skipped: true };
        }

        const tx = ensureDatabase().transaction((items) => {
            items.forEach((item) => {
                const analysis = item.analysis || {};
                defects.create({
                    imageId: item.imageId || item.id?.toString() || Date.now().toString(),
                    defectType: analysis.defectType || null,
                    severity: analysis.severity || null,
                    description: analysis.description || null,
                    possibleCauses: analysis.possibleCauses || null,
                    countermeasures: analysis.countermeasures || null,
                    rawOutput: analysis.rawOutput || null,
                    status: item.status || 'pending'
                });
            });
        });

        tx(data);

        const backupPath = jsonPath.replace(/\.json$/i, '_backup.json');
        fs.renameSync(jsonPath, backupPath);

        return { migrated: data.length };
    } catch (error) {
        console.error('Migration error:', error);
        return { migrated: 0, error: error.message };
    }
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    initDatabase,
    closeDatabase,
    migrateFromJson,
    defects,
    vectors,
    trainingSet,
    knowledgeMatrix
};
