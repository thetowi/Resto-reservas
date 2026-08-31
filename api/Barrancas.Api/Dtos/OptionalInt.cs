using System.Text.Json;
using System.Text.Json.Serialization;

namespace Barrancas.Api.Dtos;

/// <summary>
/// Permite distinguir, en un PATCH parcial, entre "no vino este campo en el
/// body" (IsSet = false, no tocar el valor actual) y "vino explicitamente
/// en null" (IsSet = true, Value = null -> por ejemplo, desasignar una mesa
/// o un responsable). Un int? comun no alcanza para esa distincion porque
/// System.Text.Json no llama al setter si la propiedad no esta en el JSON,
/// pero para eso necesitamos un converter dedicado.
/// </summary>
[JsonConverter(typeof(OptionalIntJsonConverter))]
public readonly struct OptionalInt
{
    public bool IsSet { get; }
    public int? Value { get; }

    private OptionalInt(bool isSet, int? value)
    {
        IsSet = isSet;
        Value = value;
    }

    public static readonly OptionalInt Unset = new(false, null);
    public static OptionalInt Of(int? value) => new(true, value);
}

public class OptionalIntJsonConverter : JsonConverter<OptionalInt>
{
    public override OptionalInt Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return OptionalInt.Of(null);
        }
        var value = reader.GetInt32();
        return OptionalInt.Of(value);
    }

    public override void Write(Utf8JsonWriter writer, OptionalInt value, JsonSerializerOptions options)
    {
        if (value.Value.HasValue) writer.WriteNumberValue(value.Value.Value);
        else writer.WriteNullValue();
    }
}
