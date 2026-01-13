const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.MIS_CREDENCIALES_FIREBASE);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

function generarSearchTags(nombre) {
    if (!nombre) return [];
    const palabras = nombre.trim().toUpperCase().split(/\s+/);
    return Array.from(new Set(palabras));
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };

  try {
    const datos = JSON.parse(event.body);
    const nombreMayus = datos.nombreCompleto.toUpperCase();

    // --- 1. LÓGICA DE FOLIO ÚNICO (TRANSACCIÓN) ---
    const counterRef = db.collection('metadata').doc('pacientes_control');
    
    const result = await db.runTransaction(async (transaction) => {
      // A. Validar duplicado por identidad clínica
      const busquedaIdentidad = await transaction.get(
        db.collection('pacientes')
          .where('nombreCompleto', '==', nombreMayus)
          .where('fechaNacimiento', '==', datos.fechaNacimiento)
      );
      if (!busquedaIdentidad.empty) throw new Error("DUPLICADO_IDENTIDAD");

      // B. Obtener y actualizar el contador
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists) throw new Error("CONTADOR_NO_CONFIGURADO");
      
      const nuevoNumero = (counterDoc.data().ultimoFolio || 0) + 1;
      transaction.update(counterRef, { ultimoFolio: nuevoNumero });

      // C. Formatear Folio (SANSCE-2026-0001)
      const añoActual = new Date().getFullYear();
      const folioExpediente = `SANSCE-${añoActual}-${nuevoNumero.toString().padStart(4, '0')}`;

      // D. CÁLCULO DE EDAD
      let edadCalculada = 0;
      if (datos.fechaNacimiento) {
          const hoy = new Date();
          const nac = new Date(datos.fechaNacimiento);
          edadCalculada = hoy.getFullYear() - nac.getFullYear();
          if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) {
              edadCalculada--;
          }
      }

      const partesNombre = nombreMayus.split(/\s+/);
      const nombresWeb = partesNombre[0] || "";
      const apellidoPWeb = partesNombre[1] || "";
      const apellidoMWeb = partesNombre.slice(2).join(" ") || "";

      // E. Preparar Objeto Final
      const nuevoPaciente = {
  folioExpediente, // Identificador ISO 7101
  nombres: nombresWeb,
  apellidoPaterno: apellidoPWeb,
  apellidoMaterno: apellidoMWeb,
  searchKeywords: generarSearchTags(nombreMayus),
  fechaNacimiento: datos.fechaNacimiento,
  edad: edadCalculada,
  genero: datos.genero,
  telefonoCelular: datos.telefono,
  email: datos.email,
  lugarNacimiento: datos.lugarNacimiento || "",
  lugarResidencia: datos.lugarResidencia || "",
  estadoCivil: datos.estadoCivil || "",
  religion: datos.religion || "",
  escolaridad: datos.escolaridad || "",
  ocupacion: datos.ocupacion || "",
  curp: datos.curp ? datos.curp.toUpperCase() : null,
  grupoEtnico: datos.grupoEtnico || null,
  medioMarketing: datos.comoSeEntero || "",
  referidoPor: datos.nombreReferencia || "",
  datosFiscales: datos.requiereFactura === "true" ? {
        tipoPersona: datos.tipoPersona || "Fisica",
        razonSocial: (datos.razonSocial || "").toUpperCase(),
        rfc: (datos.rfc || "").toUpperCase(),
        cpFiscal: datos.codigoPostalFiscal || "",
        emailFacturacion: datos.emailFactura || "",
        regimenFiscal: datos.regimenFiscal || "",
        usoCFDI: datos.usoCFDI || ""
  } : null,
  fechaRegistro: admin.firestore.FieldValue.serverTimestamp(),
  origen: "web_autoregistro",
  tutor: null
      };

      const newPacRef = db.collection('pacientes').doc();
      transaction.set(newPacRef, nuevoPaciente);
      
      return { folio: folioExpediente };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: '¡Registro Exitoso!', folio: result.folio })
    };

  } catch (error) {
    let msg = "Error interno";
    let code = 500;
    if (error.message === "DUPLICADO_IDENTIDAD") { msg = "Ya existe un expediente con estos datos."; code = 409; }
    if (error.message === "CONTADOR_NO_CONFIGURADO") { msg = "Error en configuración de folios."; code = 500; }
    
    return { statusCode: code, body: JSON.stringify({ message: msg }) };
  }
};