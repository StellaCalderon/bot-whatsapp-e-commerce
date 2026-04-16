const Database = require("../Database");
const { normalizarNumeroTelefono, comprobarHorarioAtencion } = require("../utils");
const fs = require("fs");
const path = require("path");



async function runTests() {
    console.log("*INICIANDO PRUEBAS DE INTEGRIDAD DEL SISTEMA*\n");
    let fallos = 0;
    let exitos = 0;

    const testDBPath = path.join(__dirname, "database_test.sqlite");
    if (fs.existsSync(testDBPath)) {
        try { fs.unlinkSync(testDBPath); } catch (e) { }
    }

    const assert = (condition, message) => {
        if (condition) {
            exitos++;
            console.log(`[PASS] ${message}`);
        } else {
            fallos++;
            console.error(`[FAIL] ${message}`);
        }
    };

    try {

        console.log("\n--- [1] Pruebas de Utilidades ---");

        assert(normalizarNumeroTelefono("622 52 33 36") === "34622523336", "Normalización de teléfono (Formato ES)");

        const horario = { inicio: "09:00", fin: "18:00" };
        const OriginalDate = Date;

        global.Date = class extends OriginalDate {
            constructor() { super(); }
            getHours() { return 10; }
            getMinutes() { return 0; }
            static now() { return Date.now(); }
        };
        assert(comprobarHorarioAtencion(horario) === true, "Horario de atención (Dentro de rango)");


        global.Date = class extends OriginalDate {
            constructor() { super(); }
            getHours() { return 20; }
            getMinutes() { return 0; }
            static now() { return Date.now(); }
        };
        assert(comprobarHorarioAtencion(horario) === false, "Horario de atención (Fuera de rango)");

        global.Date = OriginalDate;


        console.log("\n--- [2] Pruebas de Persistencia y Lógica de Negocio ---");



        const originalInit = Database.init.bind(Database);
        Database.init = async function () {
            this.db = await require("sqlite").open({ filename: testDBPath, driver: require("sqlite3").Database });
            await this.db.exec(`
                CREATE TABLE empresas (id TEXT PRIMARY KEY, nombre TEXT, horario_inicio TEXT, horario_fin TEXT, tiempo_respuesta_objetivo INTEGER);
                CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id TEXT, chatId TEXT, numero TEXT, nombre TEXT, email TEXT, idioma TEXT DEFAULT "es", ultimo_ticket_id INTEGER, UNIQUE(empresa_id, chatId));
                CREATE TABLE agentes (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id TEXT, nombre TEXT, telefono TEXT UNIQUE, categorias_asignadas TEXT, activo BOOLEAN DEFAULT 1);
                CREATE TABLE tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id TEXT, cliente_chatId TEXT, cliente_numero TEXT, categoria TEXT, descripcion TEXT, estado TEXT DEFAULT "abierto", prioridad TEXT DEFAULT "normal", agente_asignado_id INTEGER, order_id TEXT, attachments TEXT, fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP, satisfaccion INTEGER);
            `);
            return this.db;
        };

        await Database.init();


        await Database.registrarEmpresa("test_co", "Empresa Test Pro", "09:00", "18:00", 30);
        const co = await Database.getEmpresa("test_co");
        assert(co !== undefined && co.nombre === "Empresa Test Pro", "Registro y recuperación de empresa en DB");


        await Database.registrarCliente("test_co", "chat_1", "34600112233", "User 1");
        await Database.registrarCliente("test_co", "chat_1", "34600112233", "User Actualizado");
        const cliente = await Database.getCliente("test_co", "chat_1");
        assert(cliente.nombre === "User Actualizado", "Deduplicación de clientes mediante ON CONFLICT");


        await Database.registrarAgente("test_co", "Agente 1", "34611223344", ["soporte"]);
        const agentes = await Database.listarAgentesPorEmpresa("test_co");
        assert(agentes.length === 1 && agentes[0].nombre === "Agente 1", "Registro y listado de agentes por empresa");
        const tid = await Database.crearTicket("test_co", "chat_1", "34600112233", "tecnico", "Prueba de ticket");
        assert(tid > 0, "Creación exitosa de ticket");

        const stats = await Database.obtenerReporteTickets("test_co");
        assert(stats.total === 1 && stats.abiertos === 1, "Reporte de tickets dinámico");

        console.log("\nTodas las pruebas críticas han finalizado satisfactoriamente.");

    } catch (error) {
        console.error("ERROR CRÍTICO DURANTE EL TEST:", error.message);
        fallos++;
    } finally {
        if (Database.db) await Database.db.close();
        if (fs.existsSync(testDBPath)) {
            try { fs.unlinkSync(testDBPath); } catch (e) { }
        }
        console.log(`\n*RESUMEN FINAL:* ${exitos} Éxitos | ${fallos} Fallos`);
        process.exit(fallos > 0 ? 1 : 0);
    }
}

runTests();
