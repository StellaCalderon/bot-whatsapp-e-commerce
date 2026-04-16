const { companiesData } = require('./companies_config');
const Database = require('./Database');

async function run() {
    console.log("*GESTIÓN DE EMPRESAS Y AGENTES*\n");
    
    await Database.init();

    for (const company of companiesData) {
        console.log(`--- Empresa: ${company.nombre} (${company.id}) ---`);
        console.log(`Horario: ${company.horario_inicio} - ${company.horario_fin}`);
        
        const agentes = await Database.listarAgentesPorEmpresa(company.id);
        if (agentes.length === 0) {
            console.log("(AVISO) No hay agentes registrados.");
        } else {
            console.log("Agentes:");
            agentes.forEach(a => {
                console.log(` - [${a.id}] ${a.nombre} (${a.telefono}) | Categorías: ${a.categorias_asignadas}`);
            });
        }

        const stats = await Database.obtenerReporteTickets(company.id);
        console.log(`Tickets: ${stats.total} total (${stats.abiertos} abiertos, ${stats.cerrados} cerrados)`);
        console.log("\n");
    }

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
