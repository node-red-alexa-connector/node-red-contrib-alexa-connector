import { ServePackageFiles } from "./util";

module.exports = function (RED: NodeRed.Runtime.Red) {
    ServePackageFiles(RED, "/node-red-contrib-alexa-connector/*", __dirname);
}