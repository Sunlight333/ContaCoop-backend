# Socios Funds Backend

Backend API para la Plataforma de Gestión Financiera de Cooperativas.

## Tecnologías

- **Node.js** + **Express.js** - Server
- **TypeScript** - Type safety
- **Prisma** - ORM
- **PostgreSQL** - Database
- **JWT** - Authentication
- **XML-RPC** - Odoo integration

## Requisitos

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Instalación

1. **Instalar dependencias:**
```bash
cd backend
npm install
```

2. **Configurar variables de entorno:**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

3. **Configurar base de datos PostgreSQL:**
```bash
# Crear la base de datos
createdb socios_funds

# O usando psql
psql -U postgres -c "CREATE DATABASE socios_funds;"
```

4. **Ejecutar migraciones de Prisma:**
```bash
npm run prisma:generate
npm run prisma:migrate
```

5. **Poblar datos iniciales (seed):**
```bash
npm run seed
```

6. **Iniciar servidor de desarrollo:**
```bash
npm run dev
```

El servidor estará disponible en: `http://localhost:3001`

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Iniciar en modo desarrollo con hot-reload |
| `npm run build` | Compilar TypeScript a JavaScript |
| `npm start` | Iniciar servidor en producción |
| `npm run prisma:generate` | Generar cliente de Prisma |
| `npm run prisma:migrate` | Ejecutar migraciones |
| `npm run prisma:studio` | Abrir Prisma Studio (UI de base de datos) |
| `npm run seed` | Poblar base de datos con datos de prueba |

## Credenciales por defecto

Después de ejecutar el seed:

- **Admin:** admin@cooperative.com / admin123
- **Socio:** socio@cooperative.com / socio123

## API Endpoints

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Obtener usuario actual |
| PUT | `/api/auth/me/password` | Cambiar contraseña |

### Cooperativas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/cooperatives` | Listar cooperativas |
| GET | `/api/cooperatives/info` | Detalles de cooperativa |
| PUT | `/api/cooperatives/info` | Actualizar info |

### Datos Financieros
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/periods` | Períodos disponibles |
| GET | `/api/dashboard/kpis` | KPIs del dashboard |
| GET | `/api/balance-sheet` | Balance general |
| GET | `/api/balance-sheet/export` | Exportar a Excel |
| GET | `/api/cash-flow` | Flujo de caja |
| GET | `/api/cash-flow/export` | Exportar a Excel |
| GET | `/api/membership-fees` | Cuotas de socios |
| GET | `/api/membership-fees/export` | Exportar a Excel |
| GET | `/api/ratios` | Ratios financieros |
| GET | `/api/ratios/export` | Exportar a Excel |

### Carga de Datos (Admin)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/upload/balance-sheet` | Importar desde Odoo |
| POST | `/api/upload/cash-flow` | Importar desde Odoo |
| POST | `/api/upload/membership-fees` | Importar desde Odoo |
| POST | `/api/upload/ratios` | Calcular ratios |
| GET | `/api/upload/history` | Historial de cargas |

### Usuarios (Admin)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/users` | Listar usuarios |
| POST | `/api/users` | Crear usuario |
| PUT | `/api/users/:id/role` | Cambiar rol |
| PUT | `/api/users/:id/status` | Activar/desactivar |
| POST | `/api/users/:id/reset-password` | Resetear contraseña |

### Notificaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/notifications/send` | Enviar notificación (Admin) |
| GET | `/api/notifications/history` | Historial enviadas (Admin) |
| GET | `/api/notifications/me` | Mis notificaciones |
| PUT | `/api/notifications/:id/read` | Marcar como leída |

### Configuración (Admin)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/settings` | Obtener configuración |
| PUT | `/api/settings/notifications` | Config. notificaciones |
| PUT | `/api/settings/security` | Config. seguridad |
| GET | `/api/settings/odoo/status` | Estado conexión Odoo |
| PUT | `/api/settings/odoo/config` | Guardar config Odoo |
| POST | `/api/settings/odoo/test` | Probar conexión Odoo |

## Configuración de Odoo

Para conectar con Odoo, necesitas configurar las siguientes variables en Settings:

1. **URL:** URL del servidor Odoo (ej: `https://tu-odoo.com`)
2. **Database:** Nombre de la base de datos Odoo
3. **Username:** Usuario de Odoo
4. **API Key:** API Key o contraseña del usuario

La conexión usa XML-RPC según la documentación oficial de Odoo:
https://www.odoo.com/documentation/17.0/es/developer/howtos/web_services.html

## Estructura del Proyecto

```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts     # Conexión Prisma
│   │   └── env.ts          # Variables de entorno
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── cooperative.controller.ts
│   │   ├── export.controller.ts
│   │   ├── financial.controller.ts
│   │   ├── notification.controller.ts
│   │   ├── settings.controller.ts
│   │   ├── upload.controller.ts
│   │   └── user.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/
│   │   ├── index.ts
│   │   └── *.routes.ts
│   ├── services/
│   │   └── odoo.service.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── jwt.ts
│   │   ├── password.ts
│   │   └── response.ts
│   ├── app.ts              # Express app
│   └── seed.ts             # Database seeder
├── prisma/
│   └── schema.prisma       # Database schema
├── package.json
├── tsconfig.json
└── .env
```

## Producción

Para producción:

```bash
npm run build
npm start
```

Variables de entorno importantes para producción:
- `NODE_ENV=production`
- `JWT_SECRET` - Usar una clave segura
- `DATABASE_URL` - URL de PostgreSQL de producción
