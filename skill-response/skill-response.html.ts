declare var RED: NodeRed.Editor.Red;

RED.nodes.registerType("skill-response", {
    category: "Alexa Connector",
    color: "#FFFFFF",
    defaults: {
    },
    inputs: 1,
    outputs: 0,
    icon: "alexa_icon.png",
    align: "right",
    paletteLabel: function () {
        return "skill-response";
    },
    label: function (): string {
        return "skill-response";
    },
});