export function ServePackageFiles(RED: NodeRed.Runtime.Red, path: string, root: string) {
    RED.httpAdmin.get(path, function (req, res) {
        var options = {
            root: root,
            dotfiles: "deny"
        };

        res.sendFile(req.params[0], options);
    });
}