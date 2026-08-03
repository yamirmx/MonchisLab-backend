import express from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';

const prisma = new PrismaClient();
const app = express();

app.use(cors()); 
app.use(express.json());

app.get('/api/insumos', async (req: Request, res: Response) => {
  try {
    const insumos = await prisma.insumo.findMany();
    res.json(insumos);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar insumos' });
  }
});

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
    res.json(nuevaVenta);
  } catch (error) {
    res.status(500).json({ error: 'Error al cobrar la orden' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend de Monchis Lab corriendo en el puerto ${PORT}`));
