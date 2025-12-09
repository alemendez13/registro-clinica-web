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

    // 1. Evitar duplicados por email
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

    // 2. Construir objeto de Facturación (Solo si se pidió)
    let infoFiscal = null;
    if (datos.requiereFactura === "true") {
        infoFiscal = {
            tipoPersona: datos.tipoPersona || "",
            razonSocial: datos.razonSocial || "",
            rfc: datos.rfc || "",
            cp: datos.codigoPostalFiscal || "",
            emailFactura: datos.emailFactura || "",
            regimenFiscal: datos.regimenFiscal || "",
            usoCFDI: datos.usoCFDI || ""
        };
    }

    // 3. Preparar el paciente con la estructura EXACTA de tu sistema
    const nuevoPaciente = {
      // Identidad y Contacto
      nombreCompleto: datos.nombreCompleto.toUpperCase(), // Tu sistema lo prefiere en mayúsculas
      email: datos.email,
      telefono: datos.telefono, // Celular WhatsApp
      fechaNacimiento: datos.fechaNacimiento,
      genero: datos.genero,
      
      // Datos Sociodemográficos
      lugarNacimiento: datos.lugarNacimiento || "",
      lugarResidencia: datos.lugarResidencia || "",
      estadoCivil: datos.estadoCivil || "",
      religion: datos.religion || "",
      escolaridad: datos.escolaridad || "",
      ocupacion: datos.ocupacion || "",

      // Marketing (Origen)
      comoSeEntero: datos.comoSeEntero || "",
      nombreReferencia: datos.nombreReferencia || "",

      // Facturación
      datosFiscales: infoFiscal, 

      // Campos de Control (Internos)
      fechaRegistro: new Date().toISOString(),
      origen: "web_autoregistro",
      validadoPorRecepcion: false,
      importado: false
    };

    // 4. Guardar en Firebase
    await db.collection('pacientes').add(nuevoPaciente);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: '¡Registro Exitoso!' })
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error interno: ' + error.message })
    };
  }
};