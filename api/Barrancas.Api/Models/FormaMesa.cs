namespace Barrancas.Api.Models;

// Forma visual de la mesa en el plano (ver PlanoSalon.tsx): se elige a mano
// por mesa, no se deriva de la capacidad — en el salon real hay mesas
// chicas redondas y mesas chicas cuadradas por igual, asi que la persona
// que arma el plano decide. Default Cuadrada al crear una mesa nueva (ver
// Models/Mesa.cs); una division hereda la forma de su mesa base (ver
// MesasController).
public enum FormaMesa
{
    Cuadrada = 0,
    Redonda = 1,
}
