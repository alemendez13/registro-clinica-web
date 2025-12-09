const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.MIS_CREDENCIALES_FIREBASE);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  try {
    const datos = JSON.parse(event.body);

    // 1. Validación de duplicados (por email)
    if (datos.email) {
      const busqueda = await db.collection('pacientes')
        .where('email', '==', datos.email)
        .get();

      if (!busqueda.empty) {
        return {
          statusCode: 409,
          body: JSON.stringify({ message: 'Este correo ya está registrado.' })
        };
      }
    }

    // 2. Preparar el nuevo paciente (CON TODOS LOS CAMPOS NUEVOS)
    const nuevoPaciente = {
      // --- DATOS PRINCIPALES ---
      nombreCompleto: datos.nombreCompleto, // CORREGIDO: Usamos nombreCompleto
      email: datos.email,
      telefono: datos.telefono,
      fechaNacimiento: datos.fechaNacimiento,
      genero: datos.genero,
      
      // --- DATOS ADICIONALES (Según tus capturas) ---
      estadoCivil: datos.estadoCivil || "",
      escolaridad: datos.escolaridad || "",
      lugarResidencia: datos.lugarResidencia || "",
      historialMedicoPrevio: datos.historialMedicoPrevio || "",
      datosFiscales: null, // Lo dejamos vacío por ahora como en tu base actual

      // --- CAMPOS DE CONTROL ---
      fechaRegistro: new Date().toISOString(),
      origen: "web_autoregistro",
      validadoPorRecepcion: false,
      importado: false
    };

    await db.collection('pacientes').add(nuevoPaciente);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: '¡Registro Exitoso!' })
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error en el sistema: ' + error.message })
    };
  }
};