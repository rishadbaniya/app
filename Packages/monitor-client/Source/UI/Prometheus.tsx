import {GetServerURL} from "dm_common";
import React from "react";
import {Observer} from "web-vcore";
import {Column} from "web-vcore/nm/react-vcomponents.js";
import {BaseComponent} from "web-vcore/nm/react-vextensions.js";

@Observer
export class PrometheusUI extends BaseComponent<{}, {}> {
	render() {
		let {} = this.props;

		return (
			<Column style={{flex: 1, height: "100%"}}>
				<iframe src={GetServerURL("prometheus", "/", window.location.href)} style={{height: "100%"}}/>
			</Column>
		);
	}
}