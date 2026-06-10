const temperatureFactors = {
    FC: (value) => (value - 32) * 5 / 9,
    FK: (value) => (value - 32) * 5 / 9 + 273.15,

    CF: (value) => value * 9 / 5 + 32,
    CK: (value) => value + 273.15,

    KC: (value) => value - 273.15,
    KF: (value) => (value - 273.15) * 9 / 5 + 32,
};

const lengthFactors = {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
};

const weightFactors = {
    kg: 1000,
    g: 1,
    lb: 453.59237,
    oz: 28.349523125,
};

const areaFactors = {
    m2: 1,
    cm2: 0.0001,
    km2: 1_000_000,
    ft2: 0.09290304,
    in2: 0.00064516,
    yd2: 0.83612736,
    acre: 4046.8564224,
    ha: 10000,
};


const volumeFactors = {
    l: 1,
    ml: 0.001,
    m3: 1000,
    cm3: 0.001,
    gal: 3.785411784,
    qt: 0.946352946,
    pt: 0.473176473,
    cup: 0.2365882365,
    fl_oz: 0.0295735295625,
};

function convertByFactor(value, from, to, factors) {
    if (from === to) return value;

    if (!factors[from] || !factors[to]) {
        throw new Error(`Unsupported conversion: ${from} to ${to}`);
    }

    const baseValue = value * factors[from];

    return baseValue / factors[to];
}


function convertLength(value, from, to) {
    const result = convertByFactor(value, from, to, lengthFactors);
    return roundResult(result);
}

function convertWeight(value, from, to) {
    const result = convertByFactor(value, from, to, weightFactors);
    return roundResult(result);
}

function convertArea(value, from, to) {
    const result = convertByFactor(value, from, to, areaFactors);
    return roundResult(result);
}

function convertVolume(value, from, to) {
    const result = convertByFactor(value, from, to, volumeFactors);
    return roundResult(result);
}

function convertTemperature(value, from, to) {
    if (from === to) return value;

    const key = `${from}${to}`;
    const converter = temperatureFactors[key];

    if (!converter) {
        throw new Error(`Unsupported temperature conversion: ${from} to ${to}`);
    }

    const result = converter(value);
    return roundResult(result);
}

function roundResult(value) {
    return Number(value.toPrecision(4));
}


module.exports = {
    convertTemperature,
    convertLength,
    convertWeight,
    convertVolume,
    convertArea,
};