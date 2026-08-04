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

// --- INSUMOS: ELIMINAR ---
app.delete('/api/insumos/:id', async (req: Request, res: Response) => {
  try {
    await prisma.insumo.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar insumo' });
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

    // 1. Primero vaciamos la receta (borramos los ingredientes ligados al producto automáticamente)
    await prisma.producto.update({
      where: { id: idProducto },
      data: {
        ingredientes: {
          deleteMany: {} // El sistema hace el trabajo sucio por ti
        }
      }
    });

    // 2. Ahora sí, con el camino libre, borramos el producto por completo de la base de datos
    await prisma.producto.delete({ 
      where: { id: idProducto } 
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});

// ==============================================================
// MÓDULO DE VENTAS (NUEVO)
// ==============================================================

// --- VENTAS: OBTENER HISTORIAL (Para tu nueva tabla) ---
app.get('/api/ventas', async (req: Request, res: Response) => {
  try {
    const ventas = await prisma.venta.findMany({
      orderBy: { id: 'desc' }, // Trae las ventas más recientes primero
      include: { detalles: true }
    });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar el historial de ventas' });
  }
});

// --- VENTAS: COBRAR Y DESCONTAR INVENTARIO AUTOMÁTICO ---
app.post('/api/ventas', async (req: Request, res: Response) => {
  const { cliente, tipo, total, detalles } = req.body;
  try {
    // 1. Guardar la venta y generar el ticket
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

    // 2. Magia: Descontar ingredientes de la bodega
    for (const detalle of detalles) {
      if (detalle.productoId) { // Solo si es un platillo de tu menú (ignora entradas manuales)
        const producto = await prisma.producto.findUnique({
          where: { id: Number(detalle.productoId) },
          include: { ingredientes: true }
        });

        if (producto && producto.ingredientes) {
          for (const ingrediente of producto.ingredientes) {
            // Multiplica la receta por la cantidad de hamburguesas vendidas
            const cantidadGramosUsados = ingrediente.cantidad * Number(detalle.cantidad);

            // Resta el total directamente del insumo
            await prisma.insumo.update({
              where: { id: ingrediente.insumoId },
              data: {
                cantidadActual: {
                  decrement: cantidadGramosUsados
                }
              }
            });
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend de Monchis Lab corriendo en el puerto ${PORT}`));
