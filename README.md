# BetSports

Aplicativo simple para crear partidos diarios del mundial, registrar apuestas por usuario, marcar resultados y llevar un tablero de puntos con reinicio automático cuando alguien acierta todos los partidos del dia.

## Stack propuesto

- Backend: Node.js + Express + Prisma
- Frontend: React + Vite
- Base de datos: PostgreSQL administrado en Supabase

## Flujo funcional

- Un partido se crea eligiendo dos paises y su fecha opcional.
- Cada compañero escribe su nombre y su marcador directamente en la tarjeta del partido.
- Cuando se marca el resultado real, el backend calcula puntos.
- Si alguien acierta todos los partidos de la jornada, se registra como ganador y se reinicia el ciclo de puntos.

## Desarrollo local

1. Instalar dependencias en la raiz y en los subproyectos.
2. Crear un archivo `backend/.env` con `DATABASE_URL`, `PORT` y `FRONTEND_ORIGIN`.
3. Ejecutar Prisma migrate desde `backend`.
4. Levantar frontend y backend con `npm run dev` desde la raiz.

## Despliegue gratis recomendado

- Frontend: Vercel o Netlify
- Backend: Render o Railway
- Base de datos: Supabase Postgres

## Endpoints principales

- `GET /api/countries`
- `GET /api/dashboard?date=YYYY-MM-DD`
- `POST /api/users`
- `POST /api/days`
- `POST /api/bets`
- `PUT /api/matches/:id/result`
- `POST /api/days/:id/finalize`
