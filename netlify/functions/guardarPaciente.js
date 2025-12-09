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

    // 2. Construir objeto de Facturación (Si aplica)
    let infoFiscal = null;
    if (datos.requiereFactura === "true") {
        infoFiscal = {
            tipoPersona: datos.tipoPersona || "",
            razonSocial: datos.razonSocial || "",
            rfc: datos.rfc || "",
            codigoPostalFiscal: datos.codigoPostalFiscal || "",
            emailFactura: datos.emailFactura || "",
            regimenFiscal: datos.regimenFiscal || "",
            usoCFDI: datos.usoCFDI || ""
        };
    }

    // 3. Preparar el paciente (Estructura corregida)
    const nuevoPaciente = {
      // Identidad y Contacto
      nombreCompleto: datos.nombreCompleto.toUpperCase(), 
      fechaNacimiento: datos.fechaNacimiento,
      genero: datos.genero,
      telefono: datos.telefono, // WhatsApp
      email: datos.email,
      
      // Datos Sociodemográficos
      lugarNacimiento: datos.lugarNacimiento || "",
      lugarResidencia: datos.lugarResidencia || "",
      estadoCivil: datos.estadoCivil || "",
      religion: datos.religion || "",
      escolaridad: datos.escolaridad || "",
      ocupacion: datos.ocupacion || "", // Ahora es lista desplegable

      // Marketing
      comoSeEntero: datos.comoSeEntero || "",
      
      // Facturación
      datosFiscales: infoFiscal, 

      // Campos de Control Interno
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
      body: JSON.stringify({ message: 'Error interno: ' + error.message })
    };
  }
};