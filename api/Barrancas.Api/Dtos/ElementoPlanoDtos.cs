namespace Barrancas.Api.Dtos;

// DTOs de los elementos de referencia del plano visual (ventana, cocina,
// bodega, isla, mueble, etc. — ver Models/ElementoPlano.cs). Son globales
// (no dependen de fecha/turno), igual que las mesas: cualquier cambio se
// transmite a todos los clientes conectados.

public record ElementoPlanoDto(int Id, string Etiqueta, double PosX, double PosY, double Ancho, double Alto, int SalonId);

// Se crea con una posicion/tamaño de arranque razonable; el usuario lo
// arrastra y renombra despues. Etiqueta es opcional por si se quiere crear
// vacio y completarlo enseguida desde el plano. SalonId es a que salon
// pertenece (el plano de cada salon tiene sus propios carteles).
public record CrearElementoPlanoRequest(string? Etiqueta, double PosX, double PosY, int SalonId);

// Todos los campos opcionales: solo se actualiza lo que viene en el body
// (mover manda PosX/PosY, redimensionar manda Ancho/Alto, editar el texto
// manda Etiqueta).
public record ActualizarElementoPlanoRequest(
    string? Etiqueta,
    double? PosX,
    double? PosY,
    double? Ancho,
    double? Alto
);
