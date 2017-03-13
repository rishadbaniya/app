import {styles} from "../../Frame/UI/GlobalStyles";
import {BaseComponent, BaseProps} from "../../Frame/UI/ReactGlobals";
import {firebaseConnect} from "react-redux-firebase";
import Button from "../../Frame/ReactComponents/Button";
import VMessageBox from "../../Frame/UI/VMessageBox";
import {MapNode, MapNodeType} from "../@Shared/Maps/MapNode";
import {ShowConfirmationBox, ShowMessageBox} from "../../Frame/UI/VMessageBox";
import {Map, MapType} from "../@Shared/Maps/Map";
import {E} from "../../Frame/General/Globals_Free";

@firebaseConnect()
export default class AdminUI extends BaseComponent<{}, {}> {
	render() {
		let {firebase} = this.props;
		return (
			<div style={E(styles.page)}>
				<Button text="Reset database" onClick={()=> {
					ShowConfirmationBox({
						title: "Reset database?", message: "This will clear all existing data.",
						onOK: async ()=> {
							/*await firebase.Ref("nodes").remove();
							let rootNode: MapNode = {
								type: MapNodeType.Category,
								title: "Root",
								agrees: 0, degree: 0, disagrees: 0, weight: 0, // averages, generated by server
								creator: null,
								approved: true,
								accessLevel: 0, voteLevel: 0,
								supportChildren: {},
								opposeChildren: {},
								talkChildren: {},
							};
							await firebase.Ref(`nodes/${1}`).set(rootNode);
							ShowMessageBox({message: "Done!"});*/

							await firebase.Ref().update({
								users: {
									Ecq3r7NvgahaMwQQ3PsdgqAFirD2: {
										avatarUrl: "https://lh6.googleusercontent.com/-CeOB1puP1U8/AAAAAAAAAAI/AAAAAAAAAZA/nk51qe4EF8w/photo.jpg",
										displayName: "Stephen Wicklund",
										email: "venryx@gmail.com",
										providerData: [
											{
												displayName: "Stephen Wicklund",
												email: "venryx@gmail.com",
												photoURL: "https://lh6.googleusercontent.com/-CeOB1puP1U8/AAAAAAAAAAI/AAAAAAAAAZA/nk51qe4EF8w/photo.jpg",
												providerId: "google.com",
												uid: "108415649882206100036"
											}
										]
									}
								},
								maps: {
									e1: {
										name: "Global",
										type: MapType.Global,
										rootNode: "e1"
									} as Map,
								},
								nodes: {
									e1: {
										type: MapNodeType.Category, title: "Root",
										agrees: 1, degree: .7, disagrees: 0, weight: 0, // totals/averages, generated by server
										creator: "Ecq3r7NvgahaMwQQ3PsdgqAFirD2", approved: true, accessLevel: 0, voteLevel: 0,
										children: {e2: true, e3: true}, talkChildren: {},
									} as MapNode,
									e2: {
										type: MapNodeType.Category, title: "Science",
										agrees: 0, degree: 0, disagrees: 0, weight: 0,
										creator: "Ecq3r7NvgahaMwQQ3PsdgqAFirD2", approved: true, accessLevel: 0, voteLevel: 0,
										children: {}, talkChildren: {},
									} as MapNode,
									e3: {
										type: MapNodeType.Category, title: "Politics",
										agrees: 0, degree: 0, disagrees: 0, weight: 0,
										creator: "Ecq3r7NvgahaMwQQ3PsdgqAFirD2", approved: true, accessLevel: 0, voteLevel: 0,
										children: {}, talkChildren: {},
									} as MapNode,
								},
								nodeExtras: {
									e1: {
										/*title:{^}
											revisions:{^}
												e1:{^}
													content:"If something in the universe has expanded, its age in years is at least half its expansion distance in [light years]"
													creator:"user123"
													date:"date123"
												e2:{^}
													content:"Things that reach a length of X [light years] through expansion (in one direction) (from [negligible size]) are at least X years old"
													creator:"user123"
													date:"date123"
											termBindings:{^}
												"light years":{^}
													light-year-10:{^}
														upvoters:{^}
															user123:true*/
										agrees: {
											Ecq3r7NvgahaMwQQ3PsdgqAFirD2: .7
										},
										disagrees: {
										}
									}
								}
							});
							ShowMessageBox({message: "Done!"});
						}
					});
				}}/>
			</div>
		);
	}
}