const lengthUnits = [
    { label: "Millimeter", value: "mm" },
    { label: "Centimeter", value: "cm" },
    { label: "Meter", value: "m" },
    { label: "Kilometer", value: "km" },
    { label: "Inch", value: "in" },
    { label: "Foot", value: "ft" },
    { label: "Yard", value: "yd" },
    { label: "Mile", value: "mi" },
];

const temperatureUnits = [
    { label: "Celsius", value: "C" },
    { label: "Fahrenheit", value: "F" },
    { label: "Kelvin", value: "K" },
];

const weightUnits = [
    { value: "kg", label: "kilogram" },
    { value: "g", label: "gram" },
    { value: "lb", label: "pound" },
    { value: "oz", label: "ounce" },
];

const volumeUnits = [
    { value: "l", label: "liter" },
    { value: "ml", label: "milliliter" },
    { value: "m3", label: "cubic meter" },
    { value: "gal", label: "gallon" },
    { value: "qt", label: "quart" },
    { value: "pt", label: "pint" },
    { value: "cup", label: "cup" },
    { value: "fl_oz", label: "fluid ounce" },
];

const areaUnits = [
    { value: "m2", label: "square meter" },
    { value: "cm2", label: "square centimeter" },
    { value: "km2", label: "square kilometer" },
    { value: "ft2", label: "square foot" },
    { value: "in2", label: "square inch" },
    { value: "yd2", label: "square yard" },
    { value: "acre", label: "acre" },
    { value: "ha", label: "hectare" },
];

module.exports = {
    lengthUnits,
    temperatureUnits,
    weightUnits,
    volumeUnits,
    areaUnits,
}