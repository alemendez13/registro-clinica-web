const admin = require('firebase-admin');

// Aquí leemos la "llave maestra" que pondremos en Netlify más tarde
if (!admin.apps.length) {
  // Truco para leer las credenciales de forma segura
  const serviceAccount = JSON.parse(process.env.MIS_CREDENCIALES_FIREBASE);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  // Solo aceptamos envíos de datos (POST)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  try {
    const datos = JSON.parse(event.body);

    // 1. Revisar si ya existe el paciente (por email)
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

    // 2. Preparar el nuevo paciente
    // Usamos los mismos campos que vimos en tu captura de pantalla
    const nuevoPaciente = {
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      fechaNacimiento: datos.fechaNacimiento,
      genero: datos.genero,
      
      // Datos automáticos (No los llena el paciente)
      fechaRegistro: new Date().toISOString(), // Fecha de hoy
      origen: "web_autoregistro", // Para saber que vino de internet
      validadoPorRecepcion: false, // Para que recepción sepa que debe revisar
      importado: false
    };

    // 3. Guardar en la colección "pacientes" de SIEMPRE
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