import { inherits } from "util";

export enum NodeRedMessageType {
    Unknown = 0,
    SkillRequest = 1,
    SkillResponse = 2,
    AuthRequest = 3,
    AuthResponse = 4,
    Error = 5,
}

export class NodeRedMessage {
    public sequence: number;
    public signature?: string;
    public signatureVersion?: number;
    public timestamp: string;
    public payload: string = "";
    public type: NodeRedMessageType = NodeRedMessageType.Unknown;
}

export class NodeRedError {
    public message: string;
}

export class NodeRedAuthRequest {
    public instancePublicKey: string = "";
    public serverPublicKey: string = "";
    public nodeVersion?: string = "";
    public packageVersion?: string = "";
}

export class NodeRedAuthResponse {
    public success: boolean;
    public message: string;
}

export class SkillRequest extends Object {
}

export class SkillResponse extends Object {
}