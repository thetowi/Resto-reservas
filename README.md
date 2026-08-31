# Barrancas · Reservas

App de reservas para reemplazar la planilla de Google Sheets del restaurante.
Pensada para que varias personas del staff la usen **al mismo tiempo** desde
distintos dispositivos, con sincronización en tiempo real.

Stack: **.NET 10 (ASP.NET Core Web API) + Entity Framework Core + PostgreSQL**
en el backend, **Next.js + Tailwind** en el frontend, **JWT** para el login
individual de cada persona del staff, **SignalR** para tiempo real. Deploy
pensado para **Railway** (API + Postgres) y **Vercel** (frontend) — sin Docker.

## Qué reproduce de la planilla original

- Vista de un día por vez, con navegación a día anterior / siguiente / hoy.
  La app **abre siempre en el día de hoy**.
- Dos turnos por día, **Almuerzo** y **Cena**, cada uno con sus 26 filas de
  reserva pre-cargadas con los horarios habituales de la planilla.
- Columnas: Hora, Mesa, Pidió (mesa pedida puntualmente), Pax,
  Apellido/Nombre, Hab/Tel, Comentarios, Asistió.
- Panel de **mesas disponibles** con las mesas reales del salón: se pintan
  de **rojo** apenas alguna reserva de ese turno las usa (reemplaza la fórmula
  `MATCH` + formato condicional de Sheets).
- Al tildar **Asistió**, la fila se resalta en **verde**.
- Los cambios de cualquier usuario se ven al instante en las pantallas de los
  demás (SignalR), sin recargar.

### Pidió mesa

Un checkbox nuevo en cada fila, **Pidió**: se tilda cuando esa mesa fue pedida
puntualmente (por llamada, o el huésped la solicitó al hacer la reserva). Con
el checkbox tildado, el desplegable de Mesa de esa fila queda **bloqueado**
(no se puede reasignar mesa por error) — hay que destildarlo primero para
poder cambiarla. Esta regla se valida también en el backend (no solo
deshabilitando el `<select>`), así que no se puede saltear con un pedido
directo a la API.

### Confirmación al quitar una fila

El botón **×** de quitar fila ahora pide confirmación (Aceptar / Cancelar)
antes de borrar, para evitar borrados accidentales.

### Lista de espera

Debajo del panel de mesas de cada turno hay un panel **Lista de espera**,
para anotar a quien llega sin reserva y tiene que esperar mesa: nombre o
apellido, habitación/teléfono, y cantidad de pax. Cada entrada se numera en
el orden en que llegó (1°, 2°, 3°...) contando solo a quienes siguen
esperando — quien llegó primero queda arriba de todo, y a medida que van
llegando más se agregan abajo, así el staff sabe a quién le toca la próxima
mesa que se libere. Es propia de cada fecha+turno (no se mezcla Almuerzo con
Cena), y se actualiza en vivo en todas las pantallas conectadas igual que el
resto de la app. La lista scrollea adentro de su propio panel cuando se
llena de entradas, sin arrastrar hacia abajo el resto de la pantalla.

Cada entrada tiene un botón **Sentar**: lo marca como ya **ubicada** (se ve
atenuada, con el nombre tachado y un ✓ en vez del número de orden) pero
**sigue en la lista** — no se pierde el dato de que ese grupo pasó por la
espera. El botón se puede volver a tocar (↺) para deshacerlo si se marcó por
error. El contador del panel distingue cuántos grupos siguen esperando de
cuántos ya fueron ubicados. Aparte, cuando a alguien ya no corresponde que
siga figurando (se fue, o fue un error de carga), se lo saca del todo con el
botón **×** (pide confirmación).

### Ajustes de una vuelta anterior (tiempo real, mesas divididas, plano y walk-ins)

- **Actualización en vivo del panel de mesas**: se corrigió una condición de
  carrera en la conexión de SignalR que hacía que el panel de "Mesas
  disponibles" (el que pinta rojo/verde) no se actualizara solo al asignar
  una mesa desde una fila — recién se veía al recargar la página. Ahora la
  suscripción al grupo de la fecha/turno se hace apenas la conexión termina
  de conectar (y se vuelve a pedir sola si la conexión se corta y reconecta),
  así que los cambios se ven al instante en todas las pantallas conectadas,
  como el resto de la app.
- **Lista de espera pegada al panel de mesas**: se corrigió un problema de
  layout donde la lista de espera "pasaba por detrás" del panel de mesas al
  scrollear. Ahora los dos paneles se mueven juntos como un solo bloque
  pegado (sticky) al hacer scroll.
- **Dividir mesas resta la capacidad de verdad**: al dividir una mesa (por
  ejemplo una de 4 pax en una división de 2), esos 2 pax se **restan** de la
  mesa base (que queda en 2), en vez de quedar duplicados. Al borrar una
  división, sus pax **vuelven** a sumarse a la base. El total de pax del
  salón (tanto en la pantalla principal como en `/admin/mesas`) ahora suma
  todas las mesas (bases y divisiones) sin duplicar ni perder capacidad.
- **Plano visual más grande + carteles de referencia**: el lienzo del plano
  es bastante más grande (y la pantalla de `/admin/mesas` usa más ancho en
  la pestaña Plano para que entre). Además de mesas, ahora se pueden agregar
  **carteles de referencia** que no son mesas — Ventana, Cocina, Bodega,
  Isla, Mueble, Barra, Entrada, o texto libre — que se arrastran igual que
  una mesa, se renombran escribiendo directo en el cartel, se redimensionan
  tirando de la esquina inferior derecha, y se borran con la **×** que
  aparece al pasar el mouse.
- **Mesa "pedida" resaltada en el plano/panel**: cuando una reserva tiene
  tildado "Pidió mesa", esa mesa se marca con un anillo suave y pulsante en
  el mismo tono arena de la marca (no un color solido fuerte, para que no
  resulte chillón) tanto en el panel de mesas disponibles como en el plano
  visual, para que quede clara la referencia de que esa mesa fue pedida
  puntualmente y no conviene reasignarla.
- **Ocupar/liberar una mesa con un click (walk-ins)**: en el panel de mesas
  disponibles, tocar una mesa libre la marca al instante como ocupada por un
  walk-in (alguien que llega sin reserva) — se pinta de **azul**, un color
  bien distinto tanto del rojo de "ocupada" como del anillo de "pedida", y
  **no agrega ninguna fila a la lista de reservas**: es puramente una marca
  visual sobre la mesa. Tocarla de nuevo la libera (pide confirmación). Si la
  mesa está ocupada por una reserva real (no un walk-in), tocarla no la
  libera — muestra un aviso indicando que hay que editarla desde su fila,
  para no borrar por error los datos de un huésped ya cargado.
- **Se sacó el desplegable de "Responsable"**: la columna y el desplegable
  de responsable de reserva se sacaron de la grilla por no usarse en la
  práctica. El dato sigue existiendo en la base (no se perdió nada de lo ya
  cargado), simplemente ya no se edita desde esta pantalla.

### Ajustes de esta vuelta (walk-in sin fila, pedida sin naranja, espera)

- **El walk-in ya no agrega fila a la lista de reservas**: en la vuelta
  anterior, ocupar una mesa con un walk-in creaba una reserva de verdad (una
  fila más en la grilla). Ahora es puramente una marca visual sobre la mesa
  (azul) — no se toca la lista de reservas para nada. Por dentro, es una
  marca separada (tabla `WalkIns`) y no un dato colgado de una reserva.
- **"Pedida" dejó de ser naranja sólido**: ahora es un anillo suave, en el
  mismo tono arena de la marca, que pulsa muy tenue — se nota la referencia
  sin ser un color chillón.
- **La lista de espera ya no empuja el resto de la pantalla hacia abajo**:
  cuando se llena de entradas, scrollea adentro de su propio panel en vez de
  estirarlo.
- **Botón "Sentar" en la lista de espera**: marca una entrada como ya
  ubicada sin sacarla de la lista (se ve atenuada, con un ✓), y se puede
  deshacer. Así no se pierde el registro de quién esperó, aunque ya se le
  haya asignado mesa.

### Ronda 3 (roles, reporte mensual, impresión del día, aviso de sobreventa)

- **Dos roles: Admin y Staff.** Un Staff solo puede cargar/editar reservas y
  lista de espera, y ver el plano del salón en modo **lectura** (`/plano`,
  "para estudiarlo") — no puede crear ni mover mesas ni carteles. Un Admin
  puede además administrar mesas y el plano (`/admin/mesas`), cuentas
  (`/admin/usuarios`) y ver el reporte mensual (`/reportes`). El backend
  refuerza esto con `[Authorize(Roles = "Admin")]` en cada endpoint que
  corresponde, así que no se puede saltear escribiéndole directo a la API.
- **Reporte mensual de asistencia** (`/reportes`, solo Admin): elegís mes y
  año, y ves el total de reservas, pax, asistencia y % de asistencia del mes,
  con el desglose día por día y turno por turno. Solo cuenta filas de reserva
  reales (con pax cargado) — las filas vacías que la app pre-genera por
  horario no se cuentan como reservas.
- **Impresión del día** (botón **Imprimir** en el header): arma un documento
  de una sola hoja con Almuerzo y Cena completos (hora, mesa, pedida, pax,
  nombre, hab/tel, comentarios, asistió), totales y % de asistencia de cada
  turno, las mesas ocupadas por walk-in, y la lista de espera completa con
  su orden y quién ya fue ubicado — pensado para llevarlo en papel durante
  el servicio. Usa el diálogo de impresión normal del navegador (Ctrl/Cmd+P
  también funciona una vez que se apretó Imprimir, porque ahí ya quedaron
  cargados los datos de los dos turnos).
- **Aviso de sobreventa al 80% de la capacidad del salón**: cuando el pax
  reservado de un turno llega al 80% de la capacidad total del salón (suma de
  todas las mesas, bases y divisiones), aparece un aviso ámbar arriba de la
  grilla de ese turno con el porcentaje y el detalle de pax — para que el
  staff lo note antes de que se termine de llenar. Es un cálculo puramente
  del frontend (no hace falta ningún endpoint nuevo).
- Esta ronda también agregó un roster de "mozos" con PIN para identificar
  quién cargaba cada reserva — **se sacó por completo en la Ronda 4** (ver
  más abajo) por no gustar la dinámica en la práctica. Se menciona acá solo
  porque puede aparecer en migraciones o historial viejo; no forma parte de
  la app tal como está hoy.

### Ronda 4 (dividir mesa al toque desde "Mesas disponibles", se saca el PIN de mozo)

- **Dividir una mesa en dos, sin salir de la pantalla de reservas.** Al tocar
  una mesa **libre** en el panel "Mesas disponibles" ahora aparece un menú
  chico con dos opciones: **Ocupar (walk-in)** (el comportamiento de antes) o
  **Dividir mesa**. Elegir "Dividir mesa" parte esa mesa al medio en dos
  mesas nuevas e independientes, con código `{código}a` y `{código}b` (por
  ejemplo "11" → "11a" + "11b") y la capacidad repartida entre las dos — sin
  pedir ningún dato ni entrar a `/admin/mesas`. Las dos mitades quedan
  ubicadas **justo al lado** de la mesa original en la lista y en el panel
  (no al final de todo), y la mesa original queda en 0 pax propios (ya no se
  ofrece como opción para ocupar/reservar, pero sigue pudiéndose ver o borrar
  desde "Administrar mesas" una vez que sus dos mitades ya no estén). Esta
  acción la puede usar **tanto Admin como Staff** (a diferencia del resto de
  la administración de mesas, que sigue siendo exclusiva de Admin) — la idea
  es resolver una mesa grande en dos chicas al toque durante el servicio, sin
  depender de que haya un Admin disponible. La división manual de siempre
  (con código y capacidad a elección, desde `/admin/mesas` → "Dividir")
  sigue existiendo tal cual: esta es una alternativa más rápida, no un
  reemplazo.
- De paso, se corrigió el mismo problema de orden en la división manual de
  `/admin/mesas`: antes, la mesa hija nueva siempre aparecía al final de la
  lista/grilla; ahora aparece pegada a su mesa base, igual que la división
  rápida.
- **Se sacó el PIN de mozo por completo.** El usuario probó la dinámica de
  tipear un PIN para identificar quién cargaba cada reserva (agregada en la
  Ronda 3) y no le convenció en la práctica, así que se revirtió: ya no
  existe el roster de mozos, ni la columna "Mozo" en la grilla, ni el
  endpoint para resolverlo. Los roles Admin/Staff y las cuentas de login
  **no se tocaron** — siguen exactamente igual que en la Ronda 3. Quién
  cargó o editó una reserva puntual vuelve a no registrarse en ningún lado
  (mismo estado que después de la Ronda 1, cuando se había sacado el
  desplegable de "Responsable").

### Ronda 5 (salones: Restaurant, Bar, Aqua Bar...)

- **La app ya no asume un solo salón.** Hasta ahora todo (mesas, plano,
  reservas, lista de espera, walk-ins) era del "restaurante" a secas. Ahora
  existe el concepto de **Salón** (Restaurant, Bar, Aqua Bar, o los que
  hagan falta), y cada uno tiene su **propio** juego de mesas, plano visual,
  lista de reservas por turno, lista de espera y walk-ins — completamente
  independientes entre sí. Cambiar de salón en la pantalla principal (nuevo
  selector arriba, al lado del selector de fecha) es como cambiar de
  restaurante entero: otra grilla de reservas, otro panel de mesas, otra
  lista de espera.
- **Selector de salón**, visible en la pantalla principal, en `/plano` y en
  `/admin/mesas`: un desplegable simple con los salones existentes, ordenados
  por el campo `Orden`. El plano, el panel de mesas y las reservas de la
  pantalla se actualizan al instante al cambiar de salón (sin recargar), y
  la conexión de tiempo real (SignalR) se resuscribe sola al grupo del nuevo
  salón — los cambios de otros usuarios en ese mismo salón se siguen viendo
  en vivo, igual que siempre.
- **Administración de salones** (`/admin/salones`, solo Admin): crear un
  salón nuevo (con su nombre), renombrar uno existente, y borrarlo. Un salón
  **no se puede borrar** si todavía tiene mesas cargadas (hay que borrar o
  reasignar esas mesas primero) ni si es el **último salón que queda** — la
  app siempre necesita al menos uno. Un Staff puede elegir entre los salones
  que ya existen pero no puede crear, renombrar ni borrar ninguno.
- **Los códigos de mesa ("11", "12", etc.) ahora son únicos por salón, no en
  todo el restaurante**: el Bar puede tener su propia mesa "11" sin chocar
  con la "11" del Restaurant. Al crear o dividir una mesa, la validación de
  "código repetido" se revisa solo dentro del salón elegido.
- **Reporte mensual** (`/reportes`): por defecto sigue mostrando los
  **totales combinados de todos los salones** (igual que antes de esta
  ronda, para no romper el hábito de uso), pero ahora tiene un desplegable
  para filtrar por un salón puntual si hace falta desglosar Bar vs.
  Restaurant, por ejemplo.
- Al instalar la app de cero, se siembra automáticamente un salón inicial
  llamado **"Restaurant"** con todas las mesas de siempre — no hace falta
  crear nada a mano para arrancar a usarla igual que antes. Los salones
  adicionales (Bar, Aqua Bar...) se crean desde `/admin/salones` cuando
  hagan falta, y las mesas de cada uno se cargan después desde
  `/admin/mesas` con ese salón elegido en el selector.

## Administración de mesas (`/admin/mesas`)

Pantalla nueva (accesible con el botón **Mesas** del header) para llevar el
registro del salón sin tocar la base directamente:

- Cada mesa tiene un **código** y una **capacidad de pax**, editables en el
  momento (se guardan solos al salir del campo).
- Una mesa se puede **dividir** en una mesa hija independiente y más chica
  (por ejemplo "50" → "50" + "50b"), cada una con su propio código y
  capacidad, y ambas seleccionables por separado en el desplegable de Mesa de
  cada reserva. Una división no se puede volver a dividir (un solo nivel). Lo
  que le asignes a la división se le **resta** a la mesa base (por ejemplo,
  una base de 4 pax dividida en una división de 2 queda en 2) — son los
  mismos asientos repartidos, no pax nuevos. Al borrar una división, esos pax
  vuelven a sumarse a la base. También existe una división **rápida**, sin
  código ni capacidad a elección, disponible directo desde el panel "Mesas
  disponibles" de la pantalla de reservas (ver "Ronda 4" más arriba) — esta
  de acá (con control fino de código/capacidad) sigue siendo la manera de
  dividir con más control.
- Una mesa base no se puede borrar mientras tenga divisiones (hay que borrar
  esas divisiones primero); una división se borra directo.
- **Capacidad total del salón**: suma la capacidad de todas las mesas (bases
  y divisiones) — como dividir le resta la capacidad a la base, sumar las dos
  por separado no duplica nada.
- Como el resto de la app, los cambios se ven al instante en todas las
  pantallas conectadas (SignalR), sean de reservas o de administración.

La capacidad sembrada por defecto (4 pax para mesas base, 2 para divisiones)
es un valor de arranque razonable, no el dato real de cada mesa — conviene
ajustarla desde este panel la primera vez que se use la app.

### Vista Plano

Dentro de `/admin/mesas`, la pestaña **Plano** muestra el salón de arriba
para abajo: cada mesa es una caja que se **arrastra** a su lugar real (click
y arrastrar con mouse o dedo). La posición de cada mesa se guarda sola al
soltarla, y se ve al instante en todas las pantallas conectadas.

- Las mesas que todavía no se acomodaron a mano aparecen en una grilla
  automática, para que el plano no arranque vacío ni superpuesto.
- El tamaño de la caja escala con la capacidad de pax de esa mesa.
- Tiene su propio selector de fecha/turno: el color (rojo/verde) muestra si
  esa mesa ya tiene una reserva asignada en el día y turno elegidos ahí, en
  vivo — es la misma información que el panel de mesas de la pantalla
  principal, pero en el layout real del salón en vez de una grilla.
- Una división (mesa "hija") es una caja independiente, arrastrable por
  separado de su mesa base.
- Mesa **pedida** (reserva con "Pidió mesa" tildado): se marca con un anillo
  suave y pulsante (no un color sólido), distinto de "ocupada" (rojo) y de
  "walk-in" (azul), para no reasignarla por error.
- Mesa ocupada por un **walk-in** (ver más abajo): se pinta de **azul**, sin
  agregar ninguna fila a la lista de reservas.
- Además de mesas, se pueden agregar **carteles de referencia** que no son
  mesas — botones rápidos para Ventana, Cocina, Bodega, Isla, Mueble, Barra,
  Entrada, o "+ Otro…" para texto libre. Se arrastran igual que una mesa, se
  renombran escribiendo directo adentro del cartel, se redimensionan tirando
  de la esquina inferior derecha, y se borran con la **×** que aparece al
  pasar el mouse por encima.

## Qué cambia respecto a la planilla

- **Login con contraseña** (antes era un dropdown de texto libre): entrar a
  la app requiere una cuenta con contraseña, con rol Admin o Staff (ver
  "Ronda 3" más arriba).
- El campo Mesa ahora es un desplegable con las mesas reales (antes era texto
  libre, y un typo rompía el resaltado en rojo sin avisar).
- Nada de 368 pestañas ni miles de reglas de formato condicional.

## Estructura del repo

```
barrancas/
├── api/                        (solucion .NET)
│   ├── Barrancas.Api/
│   │   ├── Models/             (entidades EF: Salon, Mesa, Usuario, Reserva,
│   │   │                        Rol, Turno)
│   │   ├── Data/                (DbContext, seed, horarios default)
│   │   ├── Dtos/                 (DTOs de request/response)
│   │   ├── Controllers/          (Auth, Meta, Dias, Reservas, Mesas, Espera,
│   │   │                          ElementosPlano, Usuarios, Reportes, Salones)
│   │   ├── Hubs/                 (ReservasHub - SignalR)
│   │   ├── Services/             (DiaService, TokenService)
│   │   └── Program.cs
│   └── Barrancas.Api.Tests/      (xUnit)
└── web/                         (Next.js + Tailwind)
    └── src/
        ├── app/                  (login, cambiar-password, home, plano,
        │                          admin/mesas, admin/usuarios, admin/salones,
        │                          reportes)
        ├── components/            (incluye SalonSelector y ReporteImpresion,
        │                           esta ultima solo visible al imprimir)
        └── lib/                  (api, auth, signalr, date)
```

## Requisitos previos

- [.NET SDK 10](https://dotnet.microsoft.com/download) (o superior).
- Node.js 20+.
- Una base PostgreSQL. La forma más simple si ya vas a usar Railway: creá el
  proyecto en Railway primero, agregale el plugin de Postgres, y usá esa
  misma base para desarrollo local (Railway te da la connection string desde
  el dashboard). También podés instalar Postgres localmente si preferís.

## Backend: primera puesta en marcha

Este sandbox donde se escribió el código **no tiene salida a internet hacia
NuGet** (solo a npm/PyPI/crates.io), así que no pude correr `dotnet restore`
ni `dotnet build` acá. El código está escrito con cuidado, pero **el primer
`dotnet build` en tu máquina es el que va a confirmar que todo compila** —
si tira algún error de paquete o de tipos, pasámelo y lo corrijo en la vuelta
siguiente.

```bash
cd api

# 1. Restaurar paquetes (necesita internet a nuget.org)
dotnet restore

# 2. Instalar la herramienta de EF Core (una sola vez en tu maquina)
dotnet tool install --global dotnet-ef

# 3. Configurar la conexion a Postgres y el secreto de JWT para desarrollo:
#    ya hay valores de ejemplo en Barrancas.Api/appsettings.Development.json,
#    reemplaza ConnectionStrings:Default por los datos reales de tu Postgres
#    (local o el de Railway).

# 4. Generar la migracion inicial (crea Barrancas.Api/Migrations/)
dotnet ef migrations add InitialCreate -p Barrancas.Api -s Barrancas.Api

# 5. Correr la API (aplica la migracion y siembra mesas/usuarios automaticamente)
dotnet run --project Barrancas.Api
```

La API queda escuchando en `http://localhost:5238` (Swagger en
`http://localhost:5238/swagger`).

### Si ya tenías la base creada de antes (migración nueva)

El modelo de `Mesa` cambió para sumar la administración de mesas: se
agregaron las columnas `Capacidad`, `MesaPadreId` (división en mesas más
chicas) y `PosX`/`PosY` (posición en el plano visual), y se sacó la vieja
`CodigoAlt`. Si ya habías corrido `dotnet ef migrations add InitialCreate`
antes de este cambio, generá una migración incremental (no hace falta borrar
la base):

```bash
dotnet ef migrations add AdministracionMesas -p Barrancas.Api -s Barrancas.Api
dotnet run --project Barrancas.Api
```

Si todavía no habías corrido ninguna migración, seguí directamente con el
paso 4 de arriba (`InitialCreate` ya incluye este modelo actualizado).

Si en cambio ya habías corrido `AdministracionMesas` (por ejemplo, si
generaste esa migración antes de sumar `PosX`/`PosY`), generá una más encima,
con otro nombre:

```bash
dotnet ef migrations add PlanoDeSalon -p Barrancas.Api -s Barrancas.Api
dotnet run --project Barrancas.Api
```

Y una más si ya tenías corrida `PlanoDeSalon`: se agregó la columna
`Reserva.PidioMesa` y la tabla nueva `Esperas` (lista de espera):

```bash
dotnet ef migrations add ListaDeEsperaYPidioMesa -p Barrancas.Api -s Barrancas.Api
dotnet run --project Barrancas.Api
```

Y todavía una más si ya tenías corrida `ListaDeEsperaYPidioMesa`: se agregó
la tabla nueva `ElementosPlano` (los carteles de referencia del plano visual —
Cocina, Ventana, Bodega, etc.), la tabla nueva `WalkIns` (para marcar una mesa
como ocupada por un walk-in sin crear ninguna fila en la lista de reservas) y
la columna `Espera.Ubicada` (para poder "sentar" a alguien de la lista de
espera sin sacarlo de la lista):

```bash
dotnet ef migrations add WalkInsYUbicada -p Barrancas.Api -s Barrancas.Api
dotnet run --project Barrancas.Api
```

**⚠️ Si en algún momento llegaste a correr `dotnet ef migrations add
WalkInYElementosPlano`** (instrucción de una vuelta anterior de este mismo
README, que en ese momento incluía por error una columna `Reserva.EsWalkIn`
que después sacamos — el walk-in se rediseñó como la tabla `WalkIns` de
arriba, para que nunca apareciera como fila en la lista de reservas): antes de
correr el comando de arriba, deshacé esa migración vieja:

- Si **todavía no la aplicaste** a la base (no corriste la API después de
  generarla), simplemente borrá los dos archivos que generó en
  `Barrancas.Api/Migrations/` (el que termina en `_WalkInYElementosPlano.cs` y
  su `.Designer.cs`).
- Si **ya la aplicaste** (ya corriste la API después de generarla), corré
  primero `dotnet ef migrations remove -p Barrancas.Api -s Barrancas.Api` (esto
  deshace tanto el archivo como el cambio ya aplicado a la base).

Recién después de eso corré el `WalkInsYUbicada` de arriba.

Si todavía no habías corrido ninguna migración, no hace falta nada de esto:
seguí directo con el paso 4 de arriba, `InitialCreate` ya incluye todo el
modelo actual.

Y una más si ya tenías corrida `WalkInsYUbicada`: es la de **Ronda 3**
(roles, PIN de mozo, reporte mensual) — se agregó la columna `Usuario.Rol`,
la tabla nueva `Mozos`, se sacó la relación `Reserva.UsuarioId` y se agregó
`Reserva.MozoId` en su lugar (apuntando a la tabla `Mozos`, no a `Usuarios`):

```bash
dotnet ef migrations add RolesYMozos -p Barrancas.Api -s Barrancas.Api
dotnet run --project Barrancas.Api
```

**⚠️ Importante sobre esta migración: el seed de `Usuarios` cambió de forma
incompatible.** `DbSeeder` solo siembra `Usuarios` si la tabla está vacía, así
que si ya tenías una base con las 11 cuentas viejas (una por persona), la
migración de arriba **no las va a tocar ni a reemplazar** — vas a terminar
con tus 11 cuentas viejas, todas sin rol asignado explícitamente (van a caer
en `Rol.Staff`, el valor por default de la columna nueva) y **sin ningún
Admin**. Elegí una de estas opciones después de correr la migración:

- **Más simple (recomendado si es la primera vez que usás la app en serio):**
  vaciá la tabla `Usuarios` a mano (`DELETE FROM "Usuarios";` en una consola
  de Postgres) antes de volver a levantar la API — así el seed nuevo entra
  limpio con las dos cuentas `admin`/`staff` de abajo.
- **Si ya la estabas usando y no querés perder las cuentas existentes:**
  dejalas como están y simplemente ascendé una a Admin a mano, una única vez,
  con SQL directo (reemplazá `'majo'` por el `Username` que corresponda):
  ```sql
  UPDATE "Usuarios" SET "Rol" = 1 WHERE "Username" = 'majo';
  ```
  (`1` = Admin, `0` = Staff, según el enum `Rol` en `Models/Rol.cs`). Desde
  ahí ya podés entrar con esa cuenta y usar `/admin/usuarios` para crear o
  ajustar el resto normalmente.
- Además, como el roster de **mozos** (PIN) es una tabla nueva y separada, se
  siembra solo con los 11 nombres originales de la planilla y PINs de
  arranque secuenciales (`1001`..`1011`, ver más abajo) — no importa cuál de
  las dos opciones de arriba elijas, esa parte se siembra igual sola.

Y una última si ya tenías corrida `RolesYMozos`: es la de **Ronda 4** — se
saca por completo el roster de mozos (`Mozos` desaparece) y la columna
`Reserva.MozoId`, ya que el PIN se revirtió (ver "Ronda 4" más arriba). Los
roles y las cuentas de login (`Usuario.Rol`) no cambian en esta migración.

**Antes de generarla**, borrá estos 4 archivos que ya no forman parte del
proyecto (quedaron obsoletos con la reversión del PIN):

- `Barrancas.Api/Models/Mozo.cs`
- `Barrancas.Api/Controllers/MozosController.cs`
- `Barrancas.Api/Dtos/MozoDtos.cs`
- `Barrancas.Api.Tests/MozosEndpointsTests.cs`

Recién después de borrarlos, generá la migración:

```bash
dotnet ef migrations add SacarPinDeMozos -p Barrancas.Api -s Barrancas.Api
dotnet run --project Barrancas.Api
```

Si todavía no habías corrido `RolesYMozos` (por ejemplo, estás arrancando de
cero), no hace falta nada de esto: seguí directo con el paso 4 del principio,
`InitialCreate` ya incluye el modelo actual sin ningún rastro de mozos/PIN.

Y una última si ya tenías corrida `SacarPinDeMozos`: es la de **Ronda 5**
(salones — Restaurant, Bar, Aqua Bar, ver más arriba). Se agrega la tabla
nueva `Salones` y una columna `SalonId` (obligatoria) en `Mesas`, `Reservas`,
`Esperas`, `WalkIns` y `ElementosPlano`.

**⚠️ Esta es la migración más delicada del proyecto hasta ahora, y necesita
una edición a mano del archivo generado — leé este paso con calma antes de
correr nada.** El motivo: `SalonId` es una columna **obligatoria** (no
nullable) que se agrega a tablas que **ya tienen filas** (tus mesas y
reservas existentes). Postgres no puede dejar esas filas con un `SalonId`
que apunte a ningún salón real, así que hay que insertar un salón por
defecto y asignarle a esas filas viejas ese salón, **en el momento justo
dentro de la misma migración** — no alcanza con dejar que EF lo haga solo.

**Si estás arrancando de cero** (nunca corriste ninguna migración todavía),
no necesitás nada de esto: `InitialCreate` (paso 4, al principio de esta
sección) ya incluye el modelo con salones desde el vamos, y el seed crea el
salón "Restaurant" automáticamente antes de sembrar las mesas. Seguí directo
con el paso 4 y salteate el resto de este apartado.

**Si ya tenías la base con datos cargados**, seguí estos pasos en orden:

1. Generá la migración (todavía no la apliques):

   ```bash
   dotnet ef migrations add Salones -p Barrancas.Api -s Barrancas.Api
   ```

2. Abrí el archivo que se generó en `Barrancas.Api/Migrations/`, el que
   termina en `_Salones.cs`, y buscá el método `Up(...)`.

3. Cerca del principio vas a ver un bloque así (puede variar un poco el
   orden exacto de las columnas, no importa):

   ```csharp
   migrationBuilder.CreateTable(
       name: "Salones",
       columns: table => new
       {
           Id = table.Column<int>(type: "integer", nullable: false)
               .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
           Nombre = table.Column<string>(type: "text", nullable: false),
           Orden = table.Column<int>(type: "integer", nullable: false),
       },
       constraints: table =>
       {
           table.PrimaryKey("PK_Salones", x => x.Id);
       });
   ```

   **Justo después de ese bloque** (todavía dentro de `Up`), pegá esto para
   crear el salón por defecto — así las filas viejas van a tener a dónde
   apuntar:

   ```csharp
   migrationBuilder.Sql(@"
       INSERT INTO ""Salones"" (""Nombre"", ""Orden"") VALUES ('Restaurant', 0);
   ");
   ```

4. Más abajo en el mismo método vas a ver cinco bloques `AddColumn<int>(
   name: "SalonId", table: "...")`, uno por cada tabla (`Mesas`, `Reservas`,
   `Esperas`, `WalkIns`, `ElementosPlano`). No hace falta tocar esos bloques
   — dejalos como los generó EF.

5. Seguí bajando y vas a encontrar los primeros `migrationBuilder.AddForeignKey(...)`
   que digan `principalTable: "Salones"` (va a haber uno por cada una de las
   cinco tablas de arriba). **Justo antes del primero de esos** `AddForeignKey`
   (pero después de los cinco `AddColumn` del paso 4), pegá este bloque —
   completa el `SalonId` de todas las filas viejas con el salón recién
   creado, para que las foreign keys que vienen después no fallen:

   ```csharp
   migrationBuilder.Sql(@"
       UPDATE ""Mesas"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
       UPDATE ""Reservas"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
       UPDATE ""Esperas"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
       UPDATE ""WalkIns"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
       UPDATE ""ElementosPlano"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
   ");
   ```

   El orden final dentro de `Up()` tiene que quedar así: crear tabla
   `Salones` → insertar el salón por defecto (paso 3) → agregar las cinco
   columnas `SalonId` (paso 4, ya generado) → completar esas columnas con el
   `UPDATE` de arriba (paso 5) → recién ahí los `AddForeignKey`/`CreateIndex`
   que ya estaban generados. No hace falta reordenar nada más: los dos
   bloques que agregaste son los únicos que se mueven.

6. No hace falta tocar el método `Down(...)` — revertir esta migración borra
   la tabla `Salones` y las columnas `SalonId` igual que cualquier otra
   reversión (y, como siempre, revertir significa perder esos datos).

7. Guardá el archivo y aplicá la migración:

   ```bash
   dotnet run --project Barrancas.Api
   ```

   Si en el paso 3 o 5 no encontrás los bloques exactamente donde se
   describe (por ejemplo, si tu versión de `dotnet ef` ordena las
   operaciones distinto), lo importante es la regla, no la posición
   literal: el `INSERT` del salón tiene que ejecutarse antes que cualquier
   `UPDATE`, y el `UPDATE` de cada tabla tiene que ejecutarse después de que
   esa tabla ya tenga la columna `SalonId` (por el `AddColumn`) y antes de
   que se le agregue la foreign key hacia `Salones` (por el `AddForeignKey`)
   — movete los dos bloques `Sql(...)` a esa posición si hace falta.

   Si algo no cuadra o la migración tira un error al aplicarse, pegame el
   mensaje completo y el contenido del archivo `_Salones.cs` y lo reviso en
   la vuelta siguiente.

Si todavía no habías corrido `SacarPinDeMozos` (estás en una base más
vieja), primero seguí la cadena de migraciones de arriba en orden hasta
llegar a esa, y recién después esta.

### Correr los tests

```bash
cd api
dotnet test
```

Los tests usan el proveedor InMemory de EF Core, así que no necesitan Postgres
para correr.

### Cuentas iniciales (seed)

Se crean automáticamente dos cuentas genéricas, una por rol (básico a
propósito, para arrancar a probar los permisos — el Admin crea el resto
desde `/admin/usuarios` en cuanto haga falta más de una cuenta por rol):

| Nombre | Usuario | Contraseña | Rol |
|---|---|---|---|
| Admin | `admin` | `admin` | Admin |
| Staff | `staff` | `staff` | Staff |

## Frontend: primera puesta en marcha

```bash
cd web
npm install
cp .env.local.example .env.local
# editar .env.local si el backend no corre en http://localhost:5238
npm run dev
```

La app queda en `http://localhost:3000`. Esta parte sí la pude compilar,
lintear y levantar de punta a punta en este entorno (npm no tiene la
restricción de red que tiene NuGet).

## Deploy

### Backend + Postgres en Railway

1. Creá un proyecto nuevo en Railway y agregale el plugin **PostgreSQL**
   (esto te da automáticamente la variable `DATABASE_URL`).
2. Agregá un segundo servicio apuntando a la carpeta `api/` de este repo
   (Railway detecta el proyecto .NET y lo builda solo, sin Dockerfile).
3. Variables de entorno del servicio de la API:
   - `DATABASE_URL`: ya la provee el plugin de Postgres (referenciala con
     `${{Postgres.DATABASE_URL}}` si Railway no la linkea sola).
   - `JWT_SECRET`: generá una clave larga y aleatoria, por ejemplo con
     `openssl rand -base64 32`.
   - `CORS_ORIGIN`: la URL de Vercel una vez que la tengas (podés dejarla
     para el final y agregarla después del primer deploy del frontend).
   - `ASPNETCORE_URLS`: `http://0.0.0.0:${{PORT}}` (Railway expone el puerto
     real en la variable `PORT`; esto le dice a Kestrel que escuche ahí).
4. Antes de este primer deploy, asegurate de haber generado la migración
   inicial localmente (`dotnet ef migrations add InitialCreate`, paso 4 de
   arriba) y de haber commiteado la carpeta `Migrations/` — la API la aplica
   sola contra Postgres al arrancar.

### Frontend en Vercel

1. Importá este repo en Vercel, con **Root Directory = `web`**.
2. Variable de entorno: `NEXT_PUBLIC_API_URL` = la URL pública que Railway le
   asignó a la API (algo como `https://barrancas-api-production.up.railway.app`).
3. Deploy. Una vez que tengas la URL de Vercel, volvé a Railway y completá
   `CORS_ORIGIN` con esa URL para que el navegador pueda hablarle a la API.

## Variables de entorno (resumen)

**API** (`api/Barrancas.Api`, vía `appsettings.Development.json` en local o
variables de entorno en Railway):

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` / `ConnectionStrings:Default` | Connection string de Postgres |
| `JWT_SECRET` / `Jwt:Secret` | Clave para firmar los tokens |
| `CORS_ORIGIN` / `Cors:Origin` | Origen permitido (URL del frontend) |
| `ASPNETCORE_URLS` | En Railway, para escuchar en el puerto que asigna |

**Frontend** (`web/.env.local` en local, Environment Variables en Vercel):

| Variable | Para qué sirve |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL base de la API (incluye el hub de SignalR) |

## Pendiente para una v2 (fuera de alcance a propósito por ahora)

- Historial y buscador de clientes por apellido/fecha (se evaluó en la
  Ronda 3 y se descartó a propósito: complejo de aplicar dado cómo se maneja
  este restaurante).
- Integración real de "reservas electrónicas" (equivalente a la pestaña
  "Reservas" de la planilla original).
