const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const { faker } = require("@faker-js/faker");
const config = require("./config");

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        const dbPath = path.join(__dirname, 'database.sqlite');
        this.db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await this.db.exec(`
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS empresas (
                    id TEXT PRIMARY KEY,
                    nombre TEXT,
                    horario_inicio TEXT, 
                    horario_fin TEXT,
                    tiempo_respuesta_objetivo INTEGER 
                );

                CREATE TABLE IF NOT EXISTS agentes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    empresa_id TEXT,
                    nombre TEXT,
                    telefono TEXT UNIQUE,
                    categorias_asignadas TEXT, 
                    activo BOOLEAN DEFAULT 1,
                    FOREIGN KEY(empresa_id) REFERENCES empresas(id)
                );

                CREATE TABLE IF NOT EXISTS clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    empresa_id TEXT,
                    chatId TEXT,
                    numero TEXT,
                    nombre TEXT,
                    email TEXT,
                    idioma TEXT DEFAULT "es",
                    fecha_primer_contacto TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ultimo_ticket_id INTEGER,
                    UNIQUE(empresa_id, chatId)
                );

                CREATE TABLE IF NOT EXISTS tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    empresa_id TEXT,
                    cliente_chatId TEXT,
                    cliente_numero TEXT,
                    categoria TEXT,
                    descripcion TEXT,
                    estado TEXT DEFAULT "abierto",
                    prioridad TEXT DEFAULT "normal",
                    agente_asignado_id INTEGER,
                    order_id TEXT,
                    attachments TEXT, 
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_cierre TIMESTAMP,
                    satisfaccion INTEGER,
                    FOREIGN KEY(empresa_id) REFERENCES empresas(id),
                    FOREIGN KEY(agente_asignado_id) REFERENCES agentes(id)
                );

                CREATE TABLE IF NOT EXISTS mensajes_ticket (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id INTEGER,
                    es_agente BOOLEAN,
                    texto TEXT,
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
                );

                CREATE TABLE IF NOT EXISTS mock_orders (
                    id TEXT PRIMARY KEY,
                    status TEXT,
                    estimated_delivery TEXT,
                    customer_email TEXT,
                    items TEXT 
                );

                CREATE TABLE IF NOT EXISTS candidatos_faq (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    respuesta_normalizada TEXT UNIQUE,
                    texto_original TEXT,
                    preguntasAsociadas TEXT,
                    veces INTEGER DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS cola_mensajes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    empresa_id TEXT,
                    chatId TEXT,
                    texto TEXT,
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    intentos INTEGER DEFAULT 0
                );
            `);

        const colsClientes = await this.db.all("PRAGMA table_info(clientes)");
        if (!colsClientes.find(c => c.name === "email")) {
            await this.db.exec("ALTER TABLE clientes ADD COLUMN email TEXT");
        }

        const colsTickets = await this.db.all("PRAGMA table_info(tickets)");
        if (!colsTickets.find(c => c.name === "attachments")) {
            await this.db.exec("ALTER TABLE tickets ADD COLUMN attachments TEXT");
        }
        if (!colsTickets.find(c => c.name === "order_id")) {
            await this.db.exec("ALTER TABLE tickets ADD COLUMN order_id TEXT");
        }

        await this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_tickets_empresa ON tickets(empresa_id);
                CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets(cliente_chatId);
                CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
                CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
                CREATE INDEX IF NOT EXISTS idx_agentes_tel ON agentes(telefono);
            `);

        return this.db;
    }

    async registrarEmpresa(id, nombre, inicio, fin, objetivo) {
        await this.db.run(`
            INSERT INTO empresas (id, nombre, horario_inicio, horario_fin, tiempo_respuesta_objetivo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            nombre = excluded.nombre,
            horario_inicio = excluded.horario_inicio,
            horario_fin = excluded.horario_fin,
            tiempo_respuesta_objetivo = excluded.tiempo_respuesta_objetivo
        `, [id, nombre, inicio, fin, objetivo]);
    }

    async registrarCliente(empresaId, chatId, numero, nombre, idioma = "es", email = null) {
        try {
            await this.db.run(`
                INSERT INTO clientes (empresa_id, chatId, numero, nombre, idioma, email)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(empresa_id, chatId) DO UPDATE SET
                numero = excluded.numero,
                nombre = excluded.nombre,
                email = COALESCE(excluded.email, email)
            `, [empresaId, chatId, numero, nombre, idioma, email]);
        } catch (e) {
            console.error("(DATABASE ERROR) Registro de cliente fallido:", e.message);
        }
    }

    async getCliente(empresaId, chatId) {
        return await this.db.get("SELECT * FROM clientes WHERE empresa_id = ? AND chatId = ?", [empresaId, chatId]);
    }

    async registrarAgente(empresaId, nombre, telefono, categorias) {
        const catStr = JSON.stringify(categorias);
        await this.db.run(`
            INSERT INTO agentes (empresa_id, nombre, telefono, categorias_asignadas)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(telefono) DO UPDATE SET
                nombre = excluded.nombre,
                categorias_asignadas = excluded.categorias_asignadas
        `, [empresaId, nombre, telefono, catStr]);
    }

    async getAgentePorTelefono(telefono) {
        return await this.db.get("SELECT * FROM agentes WHERE telefono = ? AND activo = 1", [telefono]);
    }

    async getAgentePorId(id) {
        return await this.db.get("SELECT * FROM agentes WHERE id = ?", [id]);
    }

    async listarAgentesPorEmpresa(empresaId) {
        return await this.db.all("SELECT * FROM agentes WHERE empresa_id = ? AND activo = 1", [empresaId]);
    }

    async crearTicket(empresaId, chatId, numero, categoria, desc, orderId = null) {
        const res = await this.db.run(`
            INSERT INTO tickets (empresa_id, cliente_chatId, cliente_numero, categoria, descripcion, order_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [empresaId, chatId, numero, categoria, desc, orderId]);

        const ticketId = res.lastID;
        await this.db.run("UPDATE clientes SET ultimo_ticket_id = ? WHERE empresa_id = ? AND chatId = ?", [ticketId, empresaId, chatId]);
        return ticketId;
    }

    async obtenerTicket(id) {
        return await this.db.get("SELECT * FROM tickets WHERE id = ?", [id]);
    }

    async obtenerUltimoTicketAbierto(empresaId, chatId) {
        return await this.db.get(`
            SELECT * FROM tickets 
            WHERE empresa_id = ? AND cliente_chatId = ? AND estado != "cerrado"
            ORDER BY fecha_creacion DESC LIMIT 1
        `, [empresaId, chatId]);
    }

    async listarTicketsAbiertos(empresaId) {
        return await this.db.all(`SELECT * FROM tickets WHERE empresa_id = ? AND estado != "cerrado" ORDER BY fecha_creacion DESC`, [empresaId]);
    }

    async cerrarTicket(id) {
        await this.db.run("UPDATE tickets SET estado = 'cerrado', fecha_cierre = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    }

    async asignarTicket(ticketId, agenteId) {
        await this.db.run("UPDATE tickets SET agente_asignado_id = ? WHERE id = ?", [agenteId, ticketId]);
    }

    async agregarAdjuntoTicket(ticketId, filePath) {
        const t = await this.obtenerTicket(ticketId);
        if (!t) return;
        let adjuntos = t.attachments ? JSON.parse(t.attachments) : [];
        adjuntos.push(filePath);
        await this.db.run("UPDATE tickets SET attachments = ? WHERE id = ?", [JSON.stringify(adjuntos), ticketId]);
    }

    async guardarMensajeTicket(ticketId, esAgente, texto) {
        await this.db.run("INSERT INTO mensajes_ticket (ticket_id, es_agente, texto) VALUES (?, ?, ?)", [ticketId, esAgente, texto]);
    }

    async obtenerUltimosMensajesTicket(ticketId, limit = 5) {
        return await this.db.all("SELECT * FROM mensajes_ticket WHERE ticket_id = ? ORDER BY fecha DESC LIMIT ?", [ticketId, limit]);
    }

    async getMockOrder(orderId) {
        return await this.db.get("SELECT * FROM mock_orders WHERE id = ?", [orderId]);
    }



    async seedDummyAgents() {
        const count = await this.db.get("SELECT COUNT(*) as c FROM agentes");
        if (count.c === 0) {
            console.log("Sembrando agentes de prueba...");
            await this.registrarAgente("company_1", "Agente Soporte Pro", "34622523336", ["tecnico", "facturacion"]);
            await this.registrarAgente("company_1", "Agente Ventas", "34612345678", ["otro"]);
        }
    }

    async seedDummyOrders() {
        const count = await this.db.get("SELECT COUNT(*) as c FROM mock_orders");
        if (count.c === 0) {
            console.log("Generando 10 pedidos ficticios con Faker...");
            for (let i = 0; i < 10; i++) {
                const id = `ORD-${faker.number.int({ min: 10000000, max: 99999999 })}`;
                const status = faker.helpers.arrayElement(["processing", "shipped", "delivered", "cancelled"]);
                const estimated = faker.date.future({ years: 0.1 }).toISOString().split("T")[0];
                const customerEmail = faker.internet.email();
                const items = JSON.stringify([{ name: faker.commerce.productName(), quantity: faker.number.int({ min: 1, max: 3 }) }]);
                await this.db.run(`
                    INSERT INTO mock_orders (id, status, estimated_delivery, customer_email, items)
                    VALUES (?, ?, ?, ?, ?)
                `, [id, status, estimated, customerEmail, items]);
            }
        }
    }

    async obtenerReporteTickets(empresaId) {
        const total = await this.db.get("SELECT COUNT(*) as c FROM tickets WHERE empresa_id = ?", [empresaId]);
        const abiertos = await this.db.get("SELECT COUNT(*) as c FROM tickets WHERE empresa_id = ? AND estado = 'abierto'", [empresaId]);
        const enProceso = await this.db.get("SELECT COUNT(*) as c FROM tickets WHERE empresa_id = ? AND estado = 'en_proceso'", [empresaId]);
        const cerrados = await this.db.get("SELECT COUNT(*) as c FROM tickets WHERE empresa_id = ? AND estado = 'cerrado'", [empresaId]);
        const satisfaccion = await this.db.get("SELECT AVG(satisfaccion) as avg FROM tickets WHERE empresa_id = ? AND estado = 'cerrado'", [empresaId]);

        return {
            total: total.c,
            abiertos: abiertos.c,
            en_proceso: enProceso.c,
            cerrados: cerrados.c,
            satisfaccion_media: satisfaccion.avg
        };
    }




    async agregarMensajeCola(empresaId, chatId, texto) {
        await this.db.run("INSERT INTO cola_mensajes (empresa_id, chatId, texto) VALUES (?, ?, ?)", [empresaId, chatId, texto]);
    }

    async incrementarIntentoCola(id) {
        await this.db.run("UPDATE cola_mensajes SET intentos = intentos + 1 WHERE id = ?", [id]);
    }

    async eliminarMensajesCola(ids) {
        if (!ids || ids.length === 0) return;
        const placeholder = ids.map(() => "?").join(",");
        return await this.db.run(`DELETE FROM cola_mensajes WHERE id IN (${placeholder})`, ids);
    }

    async obtenerMensajesCola(empresaId) {
        return await this.db.all("SELECT * FROM cola_mensajes WHERE empresa_id = ? ORDER BY fecha ASC", [empresaId]);
    }

    async all(sql, params = []) {
        if (!this.db) await this.init();
        return await this.db.all(sql, params);
    }

    async get(sql, params = []) {
        if (!this.db) await this.init();
        return await this.db.get(sql, params);
    }

    async run(sql, params = []) {
        if (!this.db) await this.init();
        return await this.db.run(sql, params);
    }

    async exec(sql) {
        if (!this.db) await this.init();
        return await this.db.exec(sql);
    }

    async getCandidatoRespuesta(respNorm) {
        return await this.db.get("SELECT * FROM candidatos_faq WHERE respuesta_normalizada = ?", [respNorm]);
    }

    async addNuevoCandidato(respNorm, textoOriginal, pregunta) {
        await this.db.run("INSERT INTO candidatos_faq (respuesta_normalizada, texto_original, preguntasAsociadas) VALUES (?, ?, ?)", [respNorm, textoOriginal, pregunta]);
    }

    async actualizarCandidato(veces, preguntas, respNorm) {
        await this.db.run("UPDATE candidatos_faq SET veces = ?, preguntasAsociadas = ? WHERE respuesta_normalizada = ?", [veces, preguntas, respNorm]);
    }
}


module.exports = new Database();
