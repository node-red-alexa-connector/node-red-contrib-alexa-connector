declare var RED: NodeRed.Editor.Red;
declare var nacl: any;

RED.nodes.registerType("skill-request", {
    category: "Alexa Connector",
    outputs: 1,
    icon: "alexa_icon.png",
    color: "#FFFFFF",
    credentials: {
        instancePublicKey: {
            type: "text"
        },
        instancePrivateKey: {
            type: "text"
        },
        serverPublicKey: {
            type: "text"
        }
    },
    defaults: {
        connect: {
            value: "true",
            required: true,
        },
        host: {
            value: "nrac.io",
            required: true
        },
        port: {
            value: 443,
            required: true,
            validate: RED.validators.number()
        },
        useTls: {
            value: "true",
            required: true,
        },
        verifyTls: {
            value: "true",
            required: true
        },
    },
    oneditprepare: function () {
        const credentials: { instancePublicKey: string; instancePrivateKey: string; } = this.credentials;

        const instancePublicKeyEl = $("#node-input-instancePublicKey");

        const instancePrivateKeyEl = $("#node-input-instancePrivateKey");

        const instanceKeysEmpty =
            credentials.instancePublicKey === "" ||
            credentials.instancePublicKey === undefined ||
            credentials.instancePrivateKey === "" ||
            credentials.instancePrivateKey === undefined;

        if (instanceKeysEmpty) {
            const keypair = nacl.sign.keyPair();

            instancePublicKeyEl.val(
                nacl.util.encodeBase64(keypair.publicKey)
            );

            instancePrivateKeyEl.val(
                nacl.util.encodeBase64(keypair.secretKey)
            );
        }
    },
    paletteLabel: function () {
        return "skill-request";
    },
    label: function () {
        return "skill-request";
    },
});