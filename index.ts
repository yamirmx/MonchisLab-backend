import express from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';

const prisma = new PrismaClient();
const app = express();

app.use(cors()); 
app.use(express.json());

// --- INSUMOS: OBTENER ---
app.get('/api/insumos', async (req: Request, res: Response) => {
  try {
    const insumos = await prisma.insumo.findMany();
    res.json(insumos);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar insumos' });
  }
});

// --- INSUMOS: CREAR ---
app.post('/api/insumos', async (req: Request, res: Response) => {
  const { nombre, unidadMedida, cantidadActual, costoCompra, costoUnitario } = req.body;
  try {
    const nuevoInsumo = await prisma.insumo.create({
      data: { nombre, unidadMedida, cantidadActual: Number(cantidadActual), costoCompra: Number(costoCompra), costoUnitario: Number(costoUnitario) }
    });
    res.json(nuevoInsumo);
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar insumo' });
  }
});

// --- INSUMOS: ELIMINAR (CORREGIDO: BORRADO EN CASCADA) ---
app.delete('/api/insumos/:id', async (req: Request, res: Response) => {
  try {
    const insumoId = Number(req.params.id);
    
    // 1. Eliminar dependencias primero para evitar error de llave foránea
    await prisma.ingrediente.deleteMany({ where: { insumoId } });
    await prisma.detalleCompraProveedor.deleteMany({ where: { insumoId } });
    
    // 2. Eliminar el insumo
    await prisma.insumo.delete({ where: { id: insumoId } });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar insumo:", error);
    res.status(500).json({ error: 'Error al eliminar el insumo. Verifique la conexión.' });
  }
});

// --- INSUMOS: ACTUALIZAR ---
app.put('/api/insumos/:id', async (req: Request, res: Response) => {
  const { nombre, unidadMedida, cantidadActual, costoCompra, costoUnitario } = req.body;
  try {
    const actualizado = await prisma.insumo.update({
      where: { id: Number(req.params.id) },
      data: { nombre, unidadMedida, cantidadActual: Number(cantidadActual), costoCompra: Number(costoCompra), costoUnitario: Number(costoUnitario) }
    });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar insumo' });
  }
});

// --- PRODUCTOS: OBTENER ---
app.get('/api/productos', async (req: Request, res: Response) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      include: { ingredientes: { include: { insumo: true } } } 
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar el menú' });
  }
});

// --- PRODUCTOS: CREAR ---
app.post('/api/productos', async (req: Request, res: Response) => {
  const { nombre, categoria, precioVenta, ingredientes } = req.body;
  try {
    const nuevoProducto = await prisma.producto.create({
      data: {
        nombre, categoria, precioVenta: Number(precioVenta),
        ingredientes: { create: ingredientes.map((ing: any) => ({ insumoId: Number(ing.insumoId), cantidad: Number(ing.cantidad) })) }
      },
      include: { ingredientes: true }
    });
    res.json(nuevoProducto);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

// --- PRODUCTOS: ACTUALIZAR ---
app.put('/api/productos/:id', async (req: Request, res: Response) => {
  const { nombre, categoria, precioVenta, ingredientes } = req.body;
  try {
    const actualizado = await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: {
        nombre,
        categoria,
        precioVenta: Number(precioVenta),
        ingredientes: {
          deleteMany: {}, 
          create: ingredientes.map((ing: any) => ({
            insumoId: Number(ing.insumoId),
            cantidad: Number(ing.cantidad)
          })) 
        }
      },
      include: { ingredientes: true }
    });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

// --- PRODUCTOS: ELIMINAR (Borrado Físico Completo en Cascada) ---
app.delete('/api/productos/:id', async (req: Request, res: Response) => {
  try {
    const idProducto = Number(req.params.id);
    await prisma.producto.update({
      where: { id: idProducto },
      data: { ingredientes: { deleteMany: {} } }
    });
    await prisma.producto.delete({ where: { id: idProducto } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});

// ==============================================================
// MÓDULO DE VENTAS
// ==============================================================

app.get('/api/ventas', async (req: Request, res: Response) => {
  try {
    const ventas = await prisma.venta.findMany({
      orderBy: { id: 'desc' },
      include: { detalles: true }
    });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar el historial de ventas' });
  }
});

app.delete('/api/ventas/:id', async (req: Request, res: Response) => {
  try {
    const idVenta = Number(req.params.id);
    
    await prisma.venta.update({
      where: { id: idVenta },
      data: { detalles: { deleteMany: {} } }
    });

    await prisma.venta.delete({ where: { id: idVenta } });

    res.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar venta:", error);
    res.status(500).json({ error: 'Error interno al intentar borrar la venta' });
  }
});

app.delete('/api/sistema/reset-ventas', async (req: Request, res: Response) => {
  try {
    const todasLasVentas = await prisma.venta.findMany();
    
    for (const venta of todasLasVentas) {
      await prisma.venta.update({
        where: { id: venta.id },
        data: { detalles: { deleteMany: {} } }
      });
      await prisma.venta.delete({ where: { id: venta.id } });
    }
    
    try { 
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Venta" RESTART IDENTITY CASCADE;'); 
    } catch(e) {
      console.log("Aviso: No se pudo forzar el reinicio del contador en Postgres.");
    }

    try { 
      await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence WHERE name="Venta";'); 
    } catch(e) {
      console.log("Aviso: No se pudo forzar el reinicio del contador en SQLite.");
    }

    res.json({ success: true, message: "Sistema limpio." });
  } catch (error: any) {
    console.error("Error en hard reset:", error);
    res.status(500).json({ error: error.message || 'Error al limpiar el sistema' });
  }
});

// --- VENTAS: COBRAR Y DESCONTAR INVENTARIO AUTOMÁTICO ---
app.post('/api/ventas', async (req: Request, res: Response) => {
  const { cliente, tipo, total, detalles } = req.body;
  try {
    const nuevaVenta = await prisma.venta.create({
      data: {
        cliente, tipo, total: Number(total),
        detalles: { 
          create: detalles.map((d: any) => ({
            productoId: d.productoId ? Number(d.productoId) : null,
            nombre: d.nombre, cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario), subtotal: Number(d.subtotal)
          })) 
        }
      },
      include: { detalles: true }
    });

    for (const detalle of detalles) {
      if (detalle.productoId) { 
        const producto = await prisma.producto.findUnique({
          where: { id: Number(detalle.productoId) },
          include: { ingredientes: { include: { insumo: true } } } 
        });

        if (producto && producto.ingredientes) {
          for (const ingrediente of producto.ingredientes) {
            
            // 1. Calculamos la cantidad bruta que pide la receta
            let cantidadADescontar = ingrediente.cantidad * Number(detalle.cantidad);

            // 2. Si el insumo está guardado en "Kilos" o "Litros", dividimos entre 1000
            if (ingrediente.insumo) {
                if (ingrediente.insumo.unidadMedida === 'Kilos' || ingrediente.insumo.unidadMedida === 'Litros') {
                    cantidadADescontar = cantidadADescontar / 1000;
                    // 3. Forzamos precisión a 3 decimales para evitar el error de coma flotante (ej. 2.999999999999999 -> 3)
                    cantidadADescontar = Math.round(cantidadADescontar * 1000) / 1000;
                }
            }

            // 4. Actualizamos el insumo en base de datos.
            // Para asegurar la precisión final en la base de datos, usamos un enfoque en dos pasos.
            // En lugar de usar decrement (que puede generar coma flotante en SQLite/Postgres internamente),
            // calculamos el nuevo valor exacto antes de guardarlo.
            const insumoActual = await prisma.insumo.findUnique({
                where: { id: ingrediente.insumoId }
            });

            if(insumoActual) {
                let nuevoStock = Number(insumoActual.cantidadActual) - cantidadADescontar;
                // Redondeamos el stock resultante a 3 decimales máximos para mantener la integridad visual y matemática de la bodega.
                nuevoStock = Math.round(nuevoStock * 1000) / 1000;

                await prisma.insumo.update({
                  where: { id: ingrediente.insumoId },
                  data: { cantidadActual: nuevoStock }
                });
            }
          }
        }
      }
    }

    res.json(nuevaVenta);
  } catch (error) {
    console.error("Error al cobrar la orden:", error);
    res.status(500).json({ error: 'Error interno al procesar la venta y el inventario' });
  }
});

// ==============================================================
// NUEVO: MÓDULO DE PROVEEDORES Y COMPRAS
// ==============================================================

app.get('/api/proveedores', async (req: Request, res: Response) => {
  try {
    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { id: 'desc' }
    });
    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar proveedores' });
  }
});

app.post('/api/proveedores', async (req: Request, res: Response) => {
  const { nombreEmpresa, nombreRepresentante, telefono, email } = req.body;
  try {
    const nuevoProveedor = await prisma.proveedor.create({
      data: { 
        nombreEmpresa, 
        nombreRepresentante: nombreRepresentante || null, 
        telefono: telefono || null, 
        email: email || null 
      }
    });
    res.json(nuevoProveedor);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

app.delete('/api/proveedores/:id', async (req: Request, res: Response) => {
  try {
    await prisma.proveedor.update({
      where: { id: Number(req.params.id) },
      data: { activo: false } 
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

app.post('/api/compras-proveedores', async (req: Request, res: Response) => {
  const { proveedorId, folioFiscal, notas, subtotal, descuento, totalAPagar, detalles } = req.body;
  try {
    const nuevaCompra = await prisma.compraProveedor.create({
      data: {
        proveedorId: Number(proveedorId),
        folioFiscal,
        notas,
        subtotal: Number(subtotal),
        descuento: Number(descuento),
        totalAPagar: Number(totalAPagar),
        detalles: {
          create: detalles.map((d: any) => ({
            insumoId: Number(d.insumoId),
            cantidad: Number(d.cantidad),
            unidadCompra: d.unidadCompra,
            costoNeto: Number(d.costoNeto),
            precioUnitario: Number(d.precioUnitario)
          }))
        }
      }
    });

    await prisma.proveedor.update({
      where: { id: Number(proveedorId) },
      data: {
        comprasTotales: { increment: 1 },
        ultimaCompra: new Date()
      }
    });

    for (const detalle of detalles) {
      if (detalle.insumoId) {
        const insumoActual = await prisma.insumo.findUnique({ where: { id: Number(detalle.insumoId) } });
        
        if (insumoActual) {
          let cantidadASumar = Number(detalle.cantidad);
          
          // Aplicar redondeo también a la suma para prevenir problemas de precisión en las compras
          let nuevoStockSuma = Number(insumoActual.cantidadActual) + cantidadASumar;
          nuevoStockSuma = Math.round(nuevoStockSuma * 1000) / 1000;

          await prisma.insumo.update({
            where: { id: Number(detalle.insumoId) },
            data: { 
              cantidadActual: nuevoStockSuma,
              costoCompra: Number(detalle.costoNeto), 
              costoUnitario: Number(detalle.precioUnitario) 
            }
          });
        }
      }
    }

    res.json(nuevaCompra);
  } catch (error) {
    console.error("Error al registrar la compra:", error);
    res.status(500).json({ error: 'Error interno al registrar la orden de compra.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend de Monchis Lab corriendo en el puerto ${PORT}`));
