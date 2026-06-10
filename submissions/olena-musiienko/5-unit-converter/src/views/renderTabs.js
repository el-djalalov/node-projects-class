function renderTabs(activeType) {
    const tabs = [
        { type: "length", label: "Length" },
        { type: "weight", label: "Weight" },
        { type: "temperature", label: "Temperature" },
        { type: "volume", label: "Volume" },
        { type: "area", label: "Area" },
    ];

    return tabs
        .map(tab => {
            const activeClass = tab.type === activeType ? "active" : "";

            return `<a class="${activeClass}" href="/${tab.type}">${tab.label}</a>`;
        })
        .join("");
}

module.exports = { renderTabs };