import { SkillRequestNode } from "../skill-request/skill-request";
import { SkillResponse } from "../shared/messages";

interface SkillResponseProperties extends NodeRed.Runtime.NodeProperties {
    configNodeId: NodeRed.Runtime.NodeId;
}

interface SkillResponseNode extends NodeRed.Runtime.Node {
}

module.exports = function (RED: NodeRed.Runtime.Red) {
    function constructor(props: SkillResponseProperties) {
        RED.nodes.createNode(this, props);
        const node: SkillResponseNode = this;

        node.on("input", onInput);

        function onInput(msg: any) {
            const skillRequestNode = RED.nodes
                .getNode(msg.payload.skillRequestNodeId) as SkillRequestNode;

            const skillResponse: SkillResponse =
                msg.payload.skillResponse;

            skillRequestNode.processSkillResponse(skillResponse);
        }
    }

    RED.nodes.registerType("skill-response", constructor);
}