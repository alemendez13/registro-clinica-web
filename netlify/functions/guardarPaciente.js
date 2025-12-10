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

    // 1. Evitar duplicados
    if (datos.email) {
      const busqueda = await db.collection('pacientes')
        .where('email', '==', datos.email)
        .get();

      if (!busqueda.empty) {
        return { statusCode: 409, body: JSON.stringify({ message: 'Este correo ya está registrado.' }) };
      }
    }

    // 2. CÁLCULO DE EDAD (Vital para tu sistema antiguo)
    let edadCalculada = 0;
    if (datos.fechaNacimiento) {
        const hoy = new Date();
        const nac = new Date(datos.fechaNacimiento);
        edadCalculada = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
            edadCalculada--;
        }
    }

    // 3. Preparar el paciente (ESTRUCTURA CORREGIDA IDÉNTICA A TU APP)
    const nuevoPaciente = {
      // Identidad
      nombreCompleto: datos.nombreCompleto.toUpperCase(), 
      fechaNacimiento: datos.fechaNacimiento,
      edad: edadCalculada, // <--- NUEVO: Tu sistema lo pide
      genero: datos.genero,
      
      // Contacto (CORREGIDO: telefono -> telefonoCelular)
      telefonoCelular: datos.telefono, 
      email: datos.email,
      
      // Demográficos
      lugarNacimiento: datos.lugarNacimiento || "",
      lugarResidencia: datos.lugarResidencia || "",
      estadoCivil: datos.estadoCivil || "",
      religion: datos.religion || "",
      escolaridad: datos.escolaridad || "",
      ocupacion: datos.ocupacion || "",

      // Marketing (CORREGIDO: comoSeEntero -> medioMarketing)
      medioMarketing: datos.comoSeEntero || "",
      referidoPor: datos.nombreReferencia || "", // CORREGIDO

      // Facturación
      datosFiscales: datos.requiereFactura === "true" ? {
            tipoPersona: datos.tipoPersona || "Fisica",
            razonSocial: (datos.razonSocial || "").toUpperCase(),
            rfc: (datos.rfc || "").toUpperCase(),
            cpFiscal: datos.codigoPostalFiscal || "", // OJO: Tu sistema usa cpFiscal
            emailFacturacion: datos.emailFactura || "",
            regimenFiscal: datos.regimenFiscal || "",
            usoCFDI: datos.usoCFDI || ""
      } : null,

      // Control
      fechaRegistro: admin.firestore.FieldValue.serverTimestamp(),
      origen: "web_autoregistro",
      tutor: null // Por si es menor de edad, lo dejamos null por defecto en web
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