const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.MIS_CREDENCIALES_FIREBASE);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * 1. NORMALIZACIÓN ESTÁNDAR SANSCE (lib/utils.ts) [cite: 144, 153]
 * Reemplaza a 'limpiarAcentos' manteniendo la misma lógica robusta.
 */
function superNormalize(text) {
    if (!text) return "";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remueve acentos y diacríticos
        .trim()
        .toUpperCase();
}

/**
 * GENERADOR DE TAGS PARA BÚSQUEDA INTELIGENTE [cite: 153, 156]
 */
function generarSearchTags(nombre) {
    if (!nombre) return [];
    const nombreLimpio = superNormalize(nombre);
    const palabras = nombreLimpio.split(/\s+/);
    return Array.from(new Set(palabras));
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };

  try {
    const datos = JSON.parse(event.body);
    
    // 2. CONSTRUCCIÓN DEL NOMBRE (Normalización Profunda) [cite: 175, 234]
    const nombreLimpio = superNormalize(datos.nombreCompleto);

    const counterRef = db.collection('metadata').doc('pacientes_control');
    
    const result = await db.runTransaction(async (transaction) => {
      // A. Validar duplicado por identidad clínica [cite: 176]
      const busquedaIdentidad = await transaction.get(
        db.collection('pacientes')
          .where('nombreCompleto', '==', nombreLimpio)
          .where('fechaNacimiento', '==', datos.fechaNacimiento)
      );
      if (!busquedaIdentidad.empty) throw new Error("DUPLICADO_IDENTIDAD");

      // B. Obtener y actualizar el contador (Validación de configuración preservada) 
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists) throw new Error("CONTADOR_NO_CONFIGURADO");
      
      const nuevoNumero = (counterDoc.data().ultimoFolio || 0) + 1;
      transaction.update(counterRef, { ultimoFolio: nuevoNumero });

      // C. Formatear Folio SANSCE (Norma GEC-FR-02) [cite: 157]
      const añoActual = new Date().getFullYear();
      const folioExpediente = `SANSCE-${añoActual}-${nuevoNumero.toString().padStart(4, '0')}`;

      // D. CÁLCULO DE EDAD [cite: 175]
      let edadCalculada = 0;
      if (datos.fechaNacimiento) {
          const hoy = new Date();
          const nac = new Date(datos.fechaNacimiento);
          edadCalculada = hoy.getFullYear() - nac.getFullYear();
          if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) {
              edadCalculada--;
          }
      }

      const partesNombre = nombreLimpio.split(/\s+/);

      // E. Preparar Objeto Final (Integridad total de campos) [cite: 228-245]
      const nuevoPaciente = {
        folioExpediente,
        nombreCompleto: nombreLimpio, 
        nombres: partesNombre[0] || "",
        apellidoPaterno: partesNombre[1] || "",
        apellidoMaterno: partesNombre.slice(2).join(" ") || "",
        searchKeywords: generarSearchTags(nombreLimpio), 
        fechaNacimiento: datos.fechaNacimiento,
        edad: edadCalculada,
        genero: datos.genero,
        email: datos.email,
        // ✅ TRAZABILIDAD DUAL: Soporte para CRM Medular y App Externa 
        telefonos: [datos.telefono], 
        telefonoCelular: datos.telefono,
        // Campos sociodemográficos restituidos íntegramente
        lugarNacimiento: datos.lugarNacimiento || "",
        lugarResidencia: datos.lugarResidencia || "",
        estadoCivil: datos.estadoCivil || "",
        religion: datos.religion || "",
        escolaridad: datos.escolaridad || "",
        ocupacion: datos.ocupacion || "",
        curp: datos.curp ? datos.curp.toUpperCase().trim() : null,
        grupoEtnico: datos.grupoEtnico || null,
        // Campos de marketing y referencia
        medioMarketing: datos.comoSeEntero || "",
        referidoPor: datos.nombreReferencia || "",
        // Datos fiscales completos
        datosFiscales: datos.requiereFactura === "true" ? {
              tipoPersona: datos.tipoPersona || "Fisica",
              razonSocial: superNormalize(datos.razonSocial),
              rfc: (datos.rfc || "").toUpperCase().trim(),
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
    // 3. MANEJO DE ERRORES ORIGINAL PRESERVADO (Sin omisión de status codes)
    let msg = "Error interno";
    let code = 500;
    if (error.message === "DUPLICADO_IDENTIDAD") { 
        msg = "Ya existe un expediente con estos datos."; 
        code = 409; 
    }
    if (error.message === "CONTADOR_NO_CONFIGURADO") { 
        msg = "Error en configuración de folios."; 
        code = 500; 
    }
    
    return { statusCode: code, body: JSON.stringify({ message: msg }) };
  }
};