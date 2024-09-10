/* tslint:disable */
/* eslint-disable */
import "sst"
declare module "sst" {
  export interface Resource {
    "Coordinator": {
      "type": "sst.aws.Service"
    }
    "MyWeb": {
      "type": "sst.aws.StaticSite"
      "url": string
    }
    "Trpc": {
      "name": string
      "type": "sst.aws.Function"
      "url": string
    }
  }
}
export {}
