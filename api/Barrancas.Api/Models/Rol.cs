namespace Barrancas.Api.Models;

// Rol de una cuenta de login (Usuario). Admin puede administrar mesas
// (crear/editar/borrar, y el plano visual), crear y editar cuentas (Usuario),
// y ver los reportes mensuales. Staff solo carga/edita reservas, la lista de
// espera, y ve el plano del salon en modo lectura ("para estudiarlo"), sin
// poder tocar cuentas ni el resto de la administracion de mesas. La unica
// excepcion es dividir una mesa al toque desde "Mesas disponibles"
// (MesasController.DividirEnDos): esa la puede usar cualquiera de los dos
// roles, para no depender de que haya un Admin disponible durante el
// servicio.
public enum Rol
{
    Staff = 0,
    Admin = 1,
}
